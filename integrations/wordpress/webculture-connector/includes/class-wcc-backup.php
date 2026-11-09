<?php
/**
 * Backups made on the site's own server, before every change the command centre makes.
 *
 * A backup is a folder in wp-content/wcc-backups/ (web access denied) holding:
 *   database.sql.gz      every table with this site's prefix (one SQL statement per line)
 *   files-001.zip …      wp-content (themes, plugins, uploads …) plus wp-config.php, split into parts
 *
 * Scopes: database (database only — enough to undo content changes), code (database + wp-content without uploads +
 * wp-config.php — right before plugin/theme/WordPress updates) and full (everything).
 *   manifest.json        what is in it
 *
 * Shared hosting stops PHP after 30–60 seconds, so the work is done in slices: /backup/start begins (and does the
 * first slice), /backup/step continues, until the state says "done". Each slice runs for at most `budget` seconds.
 * The running state is kept in a file, not the database, so a database restore can't overwrite it mid-way.
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

class WCC_Backup {

	const DIR_NAME     = 'wcc-backups';
	const KEEP_OPTION  = 'wcc_backup_keep';
	const KEEP_DEFAULT = 5;
	const PART_BYTES   = 400 * 1024 * 1024; // start a new zip part after ~400 MB of source files
	const MAX_FILE     = 200 * 1024 * 1024; // files bigger than this are listed as skipped
	const ROWS         = 300;               // rows per INSERT batch
	const STALE        = 900;               // a job nobody has advanced for 15 minutes can be replaced

	/* ------------------------------------------------------------------ */
	/* Paths                                                                */
	/* ------------------------------------------------------------------ */

	public static function dir() {
		$dir = trailingslashit( WP_CONTENT_DIR ) . self::DIR_NAME;
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		// Deny web access on Apache / LiteSpeed / IIS; nginx gets random folder names instead.
		if ( ! file_exists( $dir . '/.htaccess' ) ) {
			@file_put_contents( $dir . '/.htaccess', "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n" ); // phpcs:ignore
		}
		if ( ! file_exists( $dir . '/index.php' ) ) {
			@file_put_contents( $dir . '/index.php', "<?php // Silence.\n" ); // phpcs:ignore
		}
		if ( ! file_exists( $dir . '/web.config' ) ) {
			@file_put_contents( $dir . '/web.config', '<?xml version="1.0"?><configuration><system.webServer><authorization><deny users="*" /></authorization></system.webServer></configuration>' ); // phpcs:ignore
		}
		return $dir;
	}

	private static function state_file() {
		return self::dir() . '/state.json';
	}

	private static function read_json( $file ) {
		if ( ! file_exists( $file ) ) {
			return null;
		}
		$j = json_decode( (string) file_get_contents( $file ), true ); // phpcs:ignore
		return is_array( $j ) ? $j : null;
	}

	private static function write_json( $file, $data ) {
		file_put_contents( $file, wp_json_encode( $data ), LOCK_EX ); // phpcs:ignore
	}

	private static function folder( $id ) {
		if ( ! preg_match( '/^[a-z0-9-]{10,80}$/', (string) $id ) ) {
			return null;
		}
		$f = self::dir() . '/' . $id;
		return is_dir( $f ) ? $f : null;
	}

	private static function time_up( $deadline ) {
		return microtime( true ) >= $deadline;
	}

	private static function prepare_runtime() {
		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 120 ); // phpcs:ignore
		}
		if ( function_exists( 'ignore_user_abort' ) ) {
			@ignore_user_abort( true ); // phpcs:ignore
		}
		wp_raise_memory_limit( 'admin' );
	}

	/* ------------------------------------------------------------------ */
	/* Start / step                                                         */
	/* ------------------------------------------------------------------ */

	/**
	 * Begin a backup (or carry on with one already running) and do the first slice.
	 *
	 * @param string $label  Why it was made, e.g. "Before AI job 42".
	 * @param string $scope  full | code | database.
	 * @param int    $budget Seconds to work for in this request.
	 */
	public static function start( $label, $scope = 'full', $budget = 20 ) {
		self::prepare_runtime();
		if ( ! class_exists( 'ZipArchive' ) && 'database' !== $scope ) {
			return new WP_Error( 'wcc_backup_zip', 'This server has no ZipArchive (PHP zip extension) — only database backups are possible.', array( 'status' => 500 ) );
		}
		$state = self::read_json( self::state_file() );
		if ( $state && 'running' === ( $state['status'] ?? '' ) && time() - (int) ( $state['touched'] ?? 0 ) < self::STALE ) {
			return self::step( $state['id'], $budget );
		}

		$free = function_exists( 'disk_free_space' ) ? @disk_free_space( WP_CONTENT_DIR ) : false; // phpcs:ignore
		if ( false !== $free && $free < 200 * 1024 * 1024 ) {
			return new WP_Error( 'wcc_backup_space', 'Less than 200 MB of disk space left on the server — not enough room for a backup.', array( 'status' => 507 ) );
		}

		global $wpdb;
		$id     = gmdate( 'Ymd-His' ) . '-' . strtolower( wp_generate_password( 12, false, false ) );
		$folder = self::dir() . '/' . $id;
		wp_mkdir_p( $folder );

		$tables = array();
		foreach ( (array) $wpdb->get_col( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $wpdb->prefix ) . '%' ) ) as $t ) {
			$tables[] = (string) $t;
		}

		$state = array(
			'id'          => $id,
			'label'       => sanitize_text_field( (string) $label ),
			'scope'       => in_array( $scope, array( 'database', 'code' ), true ) ? $scope : 'full',
			'status'      => 'running',
			'phase'       => 'database',
			'started'     => time(),
			'touched'     => time(),
			'tables'      => $tables,
			'table_i'     => 0,
			'row_offset'  => 0,
			'table_open'  => false,
			'rows'        => 0,
			'files_total' => 0,
			'files_done'  => 0,
			'bytes_done'  => 0,
			'part'        => 0,
			'part_bytes'  => 0,
			'skipped'     => array(),
			'error'       => null,
		);
		self::write_json( self::state_file(), $state );
		return self::step( $id, $budget );
	}

	/**
	 * Carry on with the running backup for up to $budget seconds.
	 */
	public static function step( $id, $budget = 20 ) {
		self::prepare_runtime();
		$state = self::read_json( self::state_file() );
		if ( ! $state || ( $state['id'] ?? '' ) !== $id ) {
			// Already finished? Report it.
			$m = self::manifest( $id );
			if ( $m ) {
				return array( 'status' => 'done', 'backup' => $m );
			}
			return new WP_Error( 'wcc_backup_unknown', 'That backup is not running.', array( 'status' => 404 ) );
		}
		if ( 'running' !== $state['status'] ) {
			return self::public_state( $state );
		}

		// Another request is still working on this backup (e.g. the caller's connection dropped and it asked again).
		if ( (int) ( $state['busy_until'] ?? 0 ) > time() ) {
			return self::public_state( $state );
		}
		$deadline            = microtime( true ) + max( 5, min( 50, (int) $budget ) );
		$folder              = self::dir() . '/' . $state['id'];
		$state['busy_until'] = time() + max( 5, min( 50, (int) $budget ) ) + 60;
		self::write_json( self::state_file(), $state );

		try {
			if ( 'database' === $state['phase'] ) {
				$state = self::dump_database( $state, $folder, $deadline );
			}
			if ( 'list' === $state['phase'] && ! self::time_up( $deadline ) ) {
				$state = self::list_files( $state, $folder );
			}
			if ( 'files' === $state['phase'] && ! self::time_up( $deadline ) ) {
				$state = self::zip_files( $state, $folder, $deadline );
			}
			if ( 'finish' === $state['phase'] ) {
				$state = self::finish( $state, $folder );
			}
		} catch ( Throwable $e ) {
			$state['status'] = 'failed';
			$state['error']  = $e->getMessage();
			WCC_Maintenance::log( 'backup', 'Backup failed: ' . $e->getMessage(), array( 'id' => $state['id'] ) );
		}

		$state['touched']    = time();
		$state['busy_until'] = 0;
		self::write_json( self::state_file(), $state );
		return self::public_state( $state );
	}

	private static function public_state( $state ) {
		$out = array(
			'id'       => $state['id'],
			'status'   => $state['status'],
			'phase'    => $state['phase'],
			'label'    => $state['label'],
			'progress' => array(
				'tables'      => count( $state['tables'] ),
				'tables_done' => min( count( $state['tables'] ), (int) $state['table_i'] ),
				'rows'        => (int) $state['rows'],
				'files_total' => (int) $state['files_total'],
				'files_done'  => (int) $state['files_done'],
				'bytes_done'  => (int) $state['bytes_done'],
			),
			'error'    => $state['error'],
		);
		if ( 'done' === $state['status'] ) {
			$out['backup'] = self::manifest( $state['id'] );
		}
		return $out;
	}

	/* ------------------------------------------------------------------ */
	/* Database                                                             */
	/* ------------------------------------------------------------------ */

	private static function sql_value( $v ) {
		global $wpdb;
		if ( null === $v ) {
			return 'NULL';
		}
		$s = $wpdb->_real_escape( (string) $v );
		$s = $wpdb->remove_placeholder_escape( $s );
		return "'" . $s . "'";
	}

	private static function dump_database( $state, $folder, $deadline ) {
		global $wpdb;
		$gz = gzopen( $folder . '/database.sql.gz', 'ab6' );
		if ( ! $gz ) {
			throw new Exception( 'Could not write the database file.' );
		}
		if ( 0 === (int) $state['table_i'] && ! $state['table_open'] && 0 === (int) $state['rows'] ) {
			gzwrite( $gz, "-- Web Culture Connector backup " . $state['id'] . "\n-- " . home_url( '/' ) . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n" );
		}

		while ( $state['table_i'] < count( $state['tables'] ) ) {
			$table = $state['tables'][ $state['table_i'] ];
			if ( ! $state['table_open'] ) {
				$create = $wpdb->get_row( 'SHOW CREATE TABLE `' . esc_sql( $table ) . '`', ARRAY_N ); // phpcs:ignore
				if ( ! $create ) {
					$state['table_i']++;
					continue;
				}
				$ddl = preg_replace( '/\s+/', ' ', (string) $create[1] );
				gzwrite( $gz, 'DROP TABLE IF EXISTS `' . $table . "`;\n" . $ddl . ";\n" );
				$state['table_open'] = true;
				$state['row_offset'] = 0;
			}
			while ( true ) {
				$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM `' . esc_sql( $table ) . '` LIMIT %d, %d', (int) $state['row_offset'], self::ROWS ), ARRAY_N ); // phpcs:ignore
				if ( ! $rows ) {
					break;
				}
				$values = array();
				foreach ( $rows as $row ) {
					$values[] = '(' . implode( ',', array_map( array( __CLASS__, 'sql_value' ), $row ) ) . ')';
				}
				gzwrite( $gz, 'INSERT INTO `' . $table . '` VALUES ' . implode( ',', $values ) . ";\n" );
				$state['row_offset'] += count( $rows );
				$state['rows']       += count( $rows );
				if ( count( $rows ) < self::ROWS ) {
					break;
				}
				if ( self::time_up( $deadline ) ) {
					gzclose( $gz );
					return $state;
				}
			}
			$state['table_open'] = false;
			$state['table_i']++;
			if ( self::time_up( $deadline ) ) {
				break;
			}
		}
		if ( $state['table_i'] >= count( $state['tables'] ) ) {
			gzwrite( $gz, "SET FOREIGN_KEY_CHECKS=1;\n-- end\n" );
			$state['phase'] = 'database' === $state['scope'] ? 'finish' : 'list';
		}
		gzclose( $gz );
		return $state;
	}

	/* ------------------------------------------------------------------ */
	/* Files                                                                */
	/* ------------------------------------------------------------------ */

	private static function skip_dir( $rel, $scope = 'full' ) {
		$rel = strtolower( $rel );
		if ( 'code' === $scope && ( 'wp-content/uploads' === $rel || 0 === strpos( $rel, 'wp-content/uploads/' ) ) ) {
			return true;
		}
		$skip = array(
			'wp-content/' . self::DIR_NAME, 'wp-content/cache', 'wp-content/upgrade', 'wp-content/upgrade-temp-backup',
			'wp-content/updraft', 'wp-content/ai1wm-backups', 'wp-content/backups-dup-lite', 'wp-content/backups-dup-pro',
			'wp-content/wpvividbackups', 'wp-content/uploads/backwpup', 'wp-content/uploads/backup-guard', 'wp-content/et-cache',
			'wp-content/litespeed', 'wp-content/w3tc-config', 'wp-content/backup-db', 'wp-content/uploads/wp-migrate-db',
		);
		foreach ( $skip as $s ) {
			if ( $rel === $s || 0 === strpos( $rel, $s . '/' ) ) {
				return true;
			}
		}
		return (bool) preg_match( '#/(node_modules|\.git|\.svn)(/|$)#', $rel );
	}

	private static function list_files( $state, $folder ) {
		$root  = untrailingslashit( ABSPATH );
		$list  = fopen( $folder . '/files.list', 'w' ); // phpcs:ignore
		$count = 0;
		$total = 0;

		$add = function ( $abs ) use ( $root, $list, &$count, &$total, &$state ) {
			$rel  = ltrim( str_replace( '\\', '/', substr( $abs, strlen( $root ) ) ), '/' );
			$size = (int) @filesize( $abs ); // phpcs:ignore
			if ( $size > self::MAX_FILE ) {
				if ( count( $state['skipped'] ) < 50 ) {
					$state['skipped'][] = $rel . ' (' . size_format( $size ) . ')';
				}
				return;
			}
			fwrite( $list, $rel . "\n" ); // phpcs:ignore
			$count++;
			$total += $size;
		};

		// wp-config.php can sit one level above the WordPress folder.
		$config = file_exists( ABSPATH . 'wp-config.php' ) ? ABSPATH . 'wp-config.php' : '';
		if ( $config ) {
			$add( $config );
		}

		$content = untrailingslashit( WP_CONTENT_DIR );
		if ( 0 !== strpos( str_replace( '\\', '/', $content ), str_replace( '\\', '/', $root ) ) ) {
			throw new Exception( 'wp-content is outside the WordPress folder — file backup is not supported on this layout.' );
		}
		$it = new RecursiveIteratorIterator(
			new RecursiveCallbackFilterIterator(
				new RecursiveDirectoryIterator( $content, FilesystemIterator::SKIP_DOTS | FilesystemIterator::UNIX_PATHS ),
				function ( $file ) use ( $root, $state ) {
					$rel = ltrim( substr( $file->getPathname(), strlen( $root ) ), '/' );
					if ( $file->isLink() ) {
						return false;
					}
					return $file->isDir() ? ! self::skip_dir( $rel, $state['scope'] ) : $file->isReadable();
				}
			),
			RecursiveIteratorIterator::LEAVES_ONLY,
			RecursiveIteratorIterator::CATCH_GET_CHILD
		);
		foreach ( $it as $file ) {
			if ( $file->isFile() ) {
				$add( $file->getPathname() );
			}
		}
		fclose( $list ); // phpcs:ignore

		$state['files_total']   = $count;
		$state['files_bytes']   = $total;
		$state['list_position'] = 0;
		$state['phase']         = 'files';
		return $state;
	}

	private static function zip_files( $state, $folder, $deadline ) {
		$root = trailingslashit( ABSPATH );
		$list = fopen( $folder . '/files.list', 'r' ); // phpcs:ignore
		if ( ! $list ) {
			throw new Exception( 'The file list is missing.' );
		}
		fseek( $list, (int) $state['list_position'] );

		if ( $state['part'] < 1 || $state['part_bytes'] >= self::PART_BYTES ) {
			$state['part']++;
			$state['part_bytes'] = 0;
		}
		$zip_path = sprintf( '%s/files-%03d.zip', $folder, $state['part'] );
		$zip      = new ZipArchive();
		if ( true !== $zip->open( $zip_path, ZipArchive::CREATE ) ) {
			fclose( $list ); // phpcs:ignore
			throw new Exception( 'Could not create the zip file.' );
		}
		$added_bytes = 0;
		$added       = 0;
		// ZipArchive compresses on close(), so stop adding once ~1/3 of the slice is used or ~60 MB is queued.
		$add_until = microtime( true ) + max( 2, ( $deadline - microtime( true ) ) / 3 );

		while ( ( $line = fgets( $list ) ) !== false ) {
			$rel = rtrim( $line, "\r\n" );
			if ( '' !== $rel && is_readable( $root . $rel ) ) {
				$zip->addFile( $root . $rel, $rel );
				if ( preg_match( '/\.(jpe?g|png|gif|webp|avif|mp4|mov|webm|mp3|zip|gz|7z|rar|woff2?|pdf)$/i', $rel ) && method_exists( $zip, 'setCompressionName' ) ) {
					$zip->setCompressionName( $rel, ZipArchive::CM_STORE ); // already compressed: just store it
				}
				$size         = (int) @filesize( $root . $rel ); // phpcs:ignore
				$added_bytes += $size;
				$state['bytes_done'] += $size;
				$state['part_bytes'] += $size;
			}
			$added++;
			$state['files_done']++;
			$state['list_position'] = ftell( $list );
			if ( microtime( true ) >= $add_until || $added_bytes > 60 * 1024 * 1024 || $state['part_bytes'] >= self::PART_BYTES || $added >= 3000 ) {
				break;
			}
		}
		$at_end = feof( $list ) || false === fgets( $list );
		fclose( $list ); // phpcs:ignore
		if ( ! $zip->close() ) {
			throw new Exception( 'Writing the zip file failed (disk full?).' );
		}
		if ( $at_end || $state['files_done'] >= $state['files_total'] ) {
			$state['phase'] = 'finish';
		}
		return $state;
	}

	/* ------------------------------------------------------------------ */
	/* Finish, list, delete                                                 */
	/* ------------------------------------------------------------------ */

	private static function finish( $state, $folder ) {
		@unlink( $folder . '/files.list' ); // phpcs:ignore
		$parts = array();
		$size  = 0;
		foreach ( (array) glob( $folder . '/*.{gz,zip}', GLOB_BRACE ) as $f ) {
			$parts[] = array( 'name' => basename( $f ), 'size' => (int) filesize( $f ) );
			$size   += (int) filesize( $f );
		}
		$manifest = array(
			'id'          => $state['id'],
			'label'       => $state['label'],
			'scope'       => $state['scope'],
			'created'     => (int) $state['started'],
			'finished'    => time(),
			'seconds'     => time() - (int) $state['started'],
			'size'        => $size,
			'parts'       => $parts,
			'tables'      => count( $state['tables'] ),
			'rows'        => (int) $state['rows'],
			'files'       => (int) $state['files_done'],
			'skipped'     => $state['skipped'],
			'wp'          => get_bloginfo( 'version' ),
			'site'        => home_url( '/' ),
			'prefix'      => $GLOBALS['wpdb']->prefix,
		);
		self::write_json( $folder . '/manifest.json', $manifest );
		$state['status'] = 'done';
		$state['phase']  = 'done';
		WCC_Maintenance::log(
			'backup',
			sprintf( 'Backup made (%s, %s): %s', array( 'database' => 'database', 'code' => 'database + themes/plugins', 'full' => 'database + all files' )[ $state['scope'] ], size_format( $size ), $state['label'] ),
			array( 'id' => $state['id'], 'size' => $size )
		);
		self::prune();
		return $state;
	}

	public static function manifest( $id ) {
		$f = self::folder( $id );
		return $f ? self::read_json( $f . '/manifest.json' ) : null;
	}

	public static function all() {
		$out = array();
		foreach ( (array) glob( self::dir() . '/*', GLOB_ONLYDIR ) as $d ) {
			$m = self::read_json( $d . '/manifest.json' );
			if ( $m ) {
				$out[] = $m;
			}
		}
		usort( $out, fn( $a, $b ) => (int) $b['created'] - (int) $a['created'] );
		return $out;
	}

	private static function prune() {
		$keep = max( 1, (int) get_option( self::KEEP_OPTION, self::KEEP_DEFAULT ) );
		$all  = self::all();
		foreach ( array_slice( $all, $keep ) as $old ) {
			self::delete( $old['id'], false );
		}
		// half-made backups left behind by a failed run
		foreach ( (array) glob( self::dir() . '/*', GLOB_ONLYDIR ) as $d ) {
			if ( ! file_exists( $d . '/manifest.json' ) && filemtime( $d ) < time() - DAY_IN_SECONDS ) {
				self::rrmdir( $d );
			}
		}
	}

	public static function delete( $id, $log = true ) {
		$f = self::folder( $id );
		if ( ! $f ) {
			return new WP_Error( 'wcc_backup_unknown', 'No such backup.', array( 'status' => 404 ) );
		}
		self::rrmdir( $f );
		if ( $log ) {
			WCC_Maintenance::log( 'backup', 'Backup deleted: ' . $id );
		}
		return array( 'deleted' => $id );
	}

	private static function rrmdir( $dir ) {
		foreach ( (array) glob( $dir . '/{,.}[!.,!..]*', GLOB_BRACE ) as $f ) {
			is_dir( $f ) ? self::rrmdir( $f ) : @unlink( $f ); // phpcs:ignore
		}
		@rmdir( $dir ); // phpcs:ignore
	}

	/* ------------------------------------------------------------------ */
	/* Download links                                                       */
	/* ------------------------------------------------------------------ */

	public static function init() {
		add_action( 'init', array( __CLASS__, 'maybe_download' ), 1 );
	}

	/** One-time link (10 minutes) to download one part of a backup. */
	public static function download_link( $id, $part ) {
		$f = self::folder( $id );
		if ( ! $f || ! preg_match( '/^(database\.sql\.gz|files-\d{3}\.zip)$/', (string) $part ) || ! file_exists( $f . '/' . $part ) ) {
			return new WP_Error( 'wcc_backup_unknown', 'No such backup file.', array( 'status' => 404 ) );
		}
		$token = bin2hex( random_bytes( 24 ) );
		set_transient( 'wcc_dl_' . $token, array( 'id' => $id, 'part' => $part ), 10 * MINUTE_IN_SECONDS );
		WCC_Maintenance::log( 'backup', 'Download link made for ' . $id . '/' . $part );
		return array(
			'url'        => add_query_arg( 'wcc_backup_dl', $token, home_url( '/' ) ),
			'expires_in' => 600,
			'size'       => (int) filesize( $f . '/' . $part ),
		);
	}

	public static function maybe_download() {
		if ( empty( $_GET['wcc_backup_dl'] ) ) { // phpcs:ignore
			return;
		}
		$token = preg_replace( '/[^a-f0-9]/', '', (string) wp_unslash( $_GET['wcc_backup_dl'] ) ); // phpcs:ignore
		$t     = get_transient( 'wcc_dl_' . $token );
		delete_transient( 'wcc_dl_' . $token );
		$f = $t ? self::folder( $t['id'] ) : null;
		if ( ! $f || ! file_exists( $f . '/' . $t['part'] ) ) {
			status_header( 404 );
			exit( 'This download link has expired.' );
		}
		$path = $f . '/' . $t['part'];
		while ( ob_get_level() ) {
			ob_end_clean();
		}
		nocache_headers();
		header( 'Content-Type: application/octet-stream' );
		header( 'Content-Disposition: attachment; filename="' . sanitize_file_name( wp_parse_url( home_url(), PHP_URL_HOST ) . '-' . $t['id'] . '-' . $t['part'] ) . '"' );
		header( 'Content-Length: ' . filesize( $path ) );
		$h = fopen( $path, 'rb' ); // phpcs:ignore
		while ( ! feof( $h ) ) {
			echo fread( $h, 1048576 ); // phpcs:ignore
			flush();
		}
		fclose( $h ); // phpcs:ignore
		exit;
	}

	/* ------------------------------------------------------------------ */
	/* Database restore                                                     */
	/* ------------------------------------------------------------------ */

	private static function restore_file() {
		return self::dir() . '/restore.json';
	}

	/**
	 * Put the database back the way it was in a backup. Runs in slices like the backup itself; call again with the
	 * same id until status is "done". Files are not restored (download them if needed).
	 */
	public static function restore_database( $id, $budget = 20 ) {
		self::prepare_runtime();
		global $wpdb;
		$f = self::folder( $id );
		if ( ! $f || ! file_exists( $f . '/database.sql.gz' ) ) {
			return new WP_Error( 'wcc_backup_unknown', 'No such backup.', array( 'status' => 404 ) );
		}
		$m = self::manifest( $id );
		if ( $m && ! empty( $m['prefix'] ) && $m['prefix'] !== $wpdb->prefix ) {
			return new WP_Error( 'wcc_restore_prefix', 'That backup is from a different table prefix.', array( 'status' => 409 ) );
		}
		$state = self::read_json( self::restore_file() );
		if ( ! $state || $state['id'] !== $id || 'done' === $state['status'] ) {
			$state = array( 'id' => $id, 'status' => 'running', 'offset' => 0, 'statements' => 0, 'started' => time(), 'error' => null );
		}
		$deadline = microtime( true ) + max( 5, min( 50, (int) $budget ) );
		$gz       = gzopen( $f . '/database.sql.gz', 'rb' );
		if ( $state['offset'] ) {
			gzseek( $gz, (int) $state['offset'] );
		}
		$wpdb->query( 'SET FOREIGN_KEY_CHECKS=0' ); // phpcs:ignore
		$finished = false;
		while ( true ) {
			$line = gzgets( $gz );
			if ( false === $line ) {
				$finished = true;
				break;
			}
			$sql = rtrim( $line, "\r\n" );
			if ( '' !== $sql && 0 !== strpos( $sql, '--' ) && 0 !== strpos( $sql, 'SET ' ) ) {
				$ok = $wpdb->query( $sql ); // phpcs:ignore
				if ( false === $ok ) {
					$state['status'] = 'failed';
					$state['error']  = 'Statement ' . ( $state['statements'] + 1 ) . ' failed: ' . $wpdb->last_error;
					break;
				}
				$state['statements']++;
			}
			$state['offset'] = gztell( $gz );
			if ( self::time_up( $deadline ) ) {
				break;
			}
		}
		gzclose( $gz );
		if ( $finished && 'running' === $state['status'] ) {
			$state['status'] = 'done';
			wp_cache_flush();
			WCC_Maintenance::purge_caches();
			WCC_Maintenance::log( 'backup', 'Database restored from backup ' . $id . ( $m ? ' (' . $m['label'] . ')' : '' ), array( 'id' => $id ) );
		}
		self::write_json( self::restore_file(), $state );
		return $state;
	}
}
