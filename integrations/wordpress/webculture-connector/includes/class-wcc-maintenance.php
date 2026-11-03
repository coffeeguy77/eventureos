<?php
/**
 * Maintenance actions: status, update checks, updates, cache purge, log.
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

class WCC_Maintenance {

	const LOG_OPTION = 'wcc_log';
	const LOG_MAX    = 200;
	const LOCK       = 'wcc_update_lock';

	/* ------------------------------------------------------------------ */
	/* Log                                                                  */
	/* ------------------------------------------------------------------ */

	public static function log( $action, $message, $data = array() ) {
		$log = get_option( self::LOG_OPTION, array() );
		if ( ! is_array( $log ) ) {
			$log = array();
		}
		array_unshift(
			$log,
			array(
				'time'    => time(),
				'action'  => $action,
				'message' => $message,
				'data'    => $data,
				'user'    => get_current_user_id(),
			)
		);
		update_option( self::LOG_OPTION, array_slice( $log, 0, self::LOG_MAX ), false );
	}

	public static function get_log( $limit = 50 ) {
		$log = get_option( self::LOG_OPTION, array() );
		return is_array( $log ) ? array_slice( $log, 0, max( 1, (int) $limit ) ) : array();
	}

	/* ------------------------------------------------------------------ */
	/* Status                                                               */
	/* ------------------------------------------------------------------ */

	private static function load_admin_includes() {
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		require_once ABSPATH . 'wp-admin/includes/update.php';
		require_once ABSPATH . 'wp-admin/includes/theme.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/misc.php';
	}

	/**
	 * Refresh the update information from WordPress.org (and premium plugin updaters).
	 */
	public static function check_updates() {
		self::load_admin_includes();
		delete_site_transient( 'update_core' );
		delete_site_transient( 'update_plugins' );
		delete_site_transient( 'update_themes' );
		wp_version_check( array(), true );
		wp_update_plugins();
		wp_update_themes();
		return self::status();
	}

	/**
	 * Full status snapshot.
	 */
	public static function status() {
		global $wpdb, $wp_version;
		self::load_admin_includes();

		$plugin_updates = get_site_transient( 'update_plugins' );
		$theme_updates  = get_site_transient( 'update_themes' );
		$core_updates   = get_core_updates( array( 'dismissed' => false ) );

		$core_new = null;
		if ( is_array( $core_updates ) ) {
			foreach ( $core_updates as $u ) {
				if ( isset( $u->response ) && 'upgrade' === $u->response ) {
					$core_new = $u->current;
					break;
				}
			}
		}

		$plugins = array();
		foreach ( get_plugins() as $file => $p ) {
			$upd       = $plugin_updates->response[ $file ] ?? null;
			$plugins[] = array(
				'file'        => $file,
				'name'        => $p['Name'],
				'version'     => $p['Version'],
				'active'      => is_plugin_active( $file ),
				'update'      => $upd ? $upd->new_version : null,
				'update_ok'   => $upd ? ! empty( $upd->package ) : null, // false = needs licence / manual download
				'auto_update' => in_array( $file, (array) get_site_option( 'auto_update_plugins', array() ), true ),
			);
		}

		$themes = array();
		$active = get_stylesheet();
		foreach ( wp_get_themes() as $slug => $t ) {
			$upd      = $theme_updates->response[ $slug ] ?? null;
			$themes[] = array(
				'slug'    => $slug,
				'name'    => $t->get( 'Name' ),
				'version' => $t->get( 'Version' ),
				'active'  => ( $slug === $active || $slug === get_template() ),
				'update'  => $upd ? $upd['new_version'] : null,
			);
		}

		$counts = array(
			'core'    => $core_new ? 1 : 0,
			'plugins' => count( array_filter( $plugins, fn( $p ) => $p['update'] ) ),
			'themes'  => count( array_filter( $themes, fn( $t ) => $t['update'] ) ),
		);

		$wc = null;
		if ( defined( 'WC_VERSION' ) ) {
			$wc = array(
				'version'  => WC_VERSION,
				'currency' => get_option( 'woocommerce_currency' ),
				'db_ok'    => version_compare( get_option( 'woocommerce_db_version', '0' ), WC_VERSION, '>=' ),
			);
		}

		return array(
			'site'        => array(
				'name' => get_bloginfo( 'name' ),
				'url'  => home_url( '/' ),
			),
			'connector'   => WCC_VERSION,
			'checked_at'  => time(),
			'environment' => array(
				'wp'           => $wp_version,
				'wp_update'    => $core_new,
				'php'          => PHP_VERSION,
				'db'           => $wpdb->db_server_info(),
				'https'        => 0 === strpos( home_url(), 'https://' ),
				'debug'        => defined( 'WP_DEBUG' ) && WP_DEBUG,
				'multisite'    => is_multisite(),
				'memory_limit' => WP_MEMORY_LIMIT,
				'timezone'     => wp_timezone_string(),
				'fs_method'    => get_filesystem_method(),
				'disk_free_mb' => function_exists( 'disk_free_space' ) ? (int) ( @disk_free_space( ABSPATH ) / 1048576 ) : null, // phpcs:ignore
				'admins'       => count( get_users( array( 'role' => 'administrator', 'fields' => 'ID' ) ) ),
				'cron_late'    => self::late_cron_count(),
			),
			'woocommerce' => $wc,
			'updates'     => $counts,
			'plugins'     => $plugins,
			'themes'      => $themes,
			'last_log'    => self::get_log( 5 ),
			'lock'        => class_exists( 'WCC_Lock' ) ? ( WCC_Lock::get() + array( 'locked' => false ) ) : null,
		);
	}

	private static function late_cron_count() {
		$crons = _get_cron_array();
		if ( ! is_array( $crons ) ) {
			return 0;
		}
		$late = 0;
		foreach ( $crons as $ts => $hooks ) {
			if ( $ts < time() - HOUR_IN_SECONDS ) {
				$late += count( $hooks );
			}
		}
		return $late;
	}

	/* ------------------------------------------------------------------ */
	/* Updates                                                              */
	/* ------------------------------------------------------------------ */

	/**
	 * Run updates.
	 *
	 * @param string $type    core|plugins|themes|translations|all.
	 * @param array  $items   Plugin files or theme slugs (empty = all with updates).
	 * @return array|WP_Error
	 */
	public static function update( $type, $items = array() ) {
		if ( get_transient( self::LOCK ) ) {
			return new WP_Error( 'wcc_locked', 'Another update is already running. Try again in a few minutes.', array( 'status' => 409 ) );
		}
		set_transient( self::LOCK, time(), 15 * MINUTE_IN_SECONDS );

		self::load_admin_includes();
		require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 600 ); // phpcs:ignore
		}
		if ( ! WP_Filesystem() ) {
			delete_transient( self::LOCK );
			return new WP_Error( 'wcc_fs', 'WordPress cannot write to its files directly on this server (filesystem method: ' . get_filesystem_method() . ').', array( 'status' => 500 ) );
		}

		// Fresh update data first.
		wp_version_check( array(), true );
		wp_update_plugins();
		wp_update_themes();

		$before = self::health_check();
		$result = array(
			'type'          => $type,
			'health_before' => $before,
			'core'          => null,
			'plugins'       => array(),
			'themes'        => array(),
			'translations'  => null,
		);

		try {
			if ( in_array( $type, array( 'plugins', 'all' ), true ) ) {
				$result['plugins'] = self::update_plugins( 'plugins' === $type ? $items : array() );
			}
			if ( in_array( $type, array( 'themes', 'all' ), true ) ) {
				$result['themes'] = self::update_themes( 'themes' === $type ? $items : array() );
			}
			if ( in_array( $type, array( 'translations', 'all' ), true ) ) {
				$result['translations'] = self::update_translations();
			}
			if ( in_array( $type, array( 'core', 'all' ), true ) ) {
				$result['core'] = self::update_core();
			}
		} finally {
			delete_transient( self::LOCK );
		}

		self::purge_caches();
		$result['health_after'] = self::health_check();

		$summary = sprintf(
			'Updates run (%s): %d plugin(s), %d theme(s)%s. Site check after: %s.',
			$type,
			count( array_filter( $result['plugins'], fn( $r ) => true === $r['ok'] ) ),
			count( array_filter( $result['themes'], fn( $r ) => true === $r['ok'] ) ),
			! empty( $result['core']['ok'] ) ? ', WordPress ' . $result['core']['to'] : '',
			$result['health_after']['ok'] ? 'OK' : 'PROBLEM (' . $result['health_after']['message'] . ')'
		);
		self::log( 'update', $summary, $result );
		$result['summary'] = $summary;
		return $result;
	}

	private static function update_plugins( $only ) {
		$updates = get_site_transient( 'update_plugins' );
		$files   = array_keys( (array) ( $updates->response ?? array() ) );
		if ( $only ) {
			$files = array_values( array_intersect( $files, (array) $only ) );
		}
		// Update this connector last so the request can finish.
		usort( $files, fn( $a, $b ) => ( plugin_basename( WCC_FILE ) === $a ) <=> ( plugin_basename( WCC_FILE ) === $b ) );

		$out = array();
		if ( ! $files ) {
			return $out;
		}
		$all_plugins = get_plugins();
		$was_active  = array();
		foreach ( $files as $f ) {
			$was_active[ $f ] = is_plugin_active( $f );
		}

		$skin     = new WP_Ajax_Upgrader_Skin();
		$upgrader = new Plugin_Upgrader( $skin );
		$results  = $upgrader->bulk_upgrade( $files );

		wp_clean_plugins_cache();
		$after = get_plugins();
		foreach ( $files as $f ) {
			$r     = $results[ $f ] ?? null;
			$ok    = ( $r && ! is_wp_error( $r ) );
			$error = is_wp_error( $r ) ? $r->get_error_message() : ( $ok ? null : implode( ' ', (array) $skin->get_error_messages() ) );
			if ( $ok && $was_active[ $f ] && ! is_plugin_active( $f ) ) {
				activate_plugin( $f, '', false, true );
			}
			$out[] = array(
				'file'  => $f,
				'name'  => $all_plugins[ $f ]['Name'] ?? $f,
				'from'  => $all_plugins[ $f ]['Version'] ?? null,
				'to'    => $after[ $f ]['Version'] ?? null,
				'ok'    => $ok && ( ( $after[ $f ]['Version'] ?? '' ) !== ( $all_plugins[ $f ]['Version'] ?? '' ) ),
				'error' => $error ? $error : ( $ok ? null : 'Update package not available (licence or manual download may be needed).' ),
			);
		}
		return $out;
	}

	private static function update_themes( $only ) {
		$updates = get_site_transient( 'update_themes' );
		$slugs   = array_keys( (array) ( $updates->response ?? array() ) );
		if ( $only ) {
			$slugs = array_values( array_intersect( $slugs, (array) $only ) );
		}
		$out = array();
		if ( ! $slugs ) {
			return $out;
		}
		$before = array();
		foreach ( $slugs as $s ) {
			$before[ $s ] = wp_get_theme( $s )->get( 'Version' );
		}
		$skin     = new WP_Ajax_Upgrader_Skin();
		$upgrader = new Theme_Upgrader( $skin );
		$results  = $upgrader->bulk_upgrade( $slugs );
		wp_clean_themes_cache();
		foreach ( $slugs as $s ) {
			$r     = $results[ $s ] ?? null;
			$to    = wp_get_theme( $s )->get( 'Version' );
			$out[] = array(
				'slug'  => $s,
				'from'  => $before[ $s ],
				'to'    => $to,
				'ok'    => $r && ! is_wp_error( $r ) && $to !== $before[ $s ],
				'error' => is_wp_error( $r ) ? $r->get_error_message() : null,
			);
		}
		return $out;
	}

	private static function update_translations() {
		$skin     = new WP_Ajax_Upgrader_Skin();
		$upgrader = new Language_Pack_Upgrader( $skin );
		$r        = $upgrader->bulk_upgrade();
		return array( 'ok' => ! is_wp_error( $r ) && false !== $r );
	}

	private static function update_core() {
		global $wp_version;
		$from = $wp_version;
		require_once ABSPATH . 'wp-admin/includes/update.php';
		$updates = get_core_updates();
		$offer   = null;
		foreach ( (array) $updates as $u ) {
			if ( isset( $u->response ) && 'upgrade' === $u->response ) {
				$offer = $u;
				break;
			}
		}
		if ( ! $offer ) {
			return array( 'ok' => false, 'from' => $from, 'to' => $from, 'error' => 'Already up to date.' );
		}
		$skin     = new WP_Ajax_Upgrader_Skin();
		$upgrader = new Core_Upgrader( $skin );
		$r        = $upgrader->upgrade( $offer, array( 'allow_relaxed_file_ownership' => true ) );
		if ( is_wp_error( $r ) ) {
			return array( 'ok' => false, 'from' => $from, 'to' => $offer->current, 'error' => $r->get_error_message() );
		}
		// Database upgrade if needed.
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		wp_upgrade();
		return array( 'ok' => true, 'from' => $from, 'to' => is_string( $r ) ? $r : $offer->current, 'error' => null );
	}

	/* ------------------------------------------------------------------ */
	/* Health + caches                                                      */
	/* ------------------------------------------------------------------ */

	/**
	 * Load the homepage like a visitor and look for a fatal error.
	 */
	public static function health_check() {
		$url  = add_query_arg( 'wcc_health', time(), home_url( '/' ) );
		$resp = wp_remote_get(
			$url,
			array(
				'timeout'     => 30,
				'redirection' => 3,
				'sslverify'   => false,
				'headers'     => array( 'Cache-Control' => 'no-cache' ),
			)
		);
		if ( is_wp_error( $resp ) ) {
			return array( 'ok' => false, 'code' => 0, 'message' => $resp->get_error_message() );
		}
		$code  = (int) wp_remote_retrieve_response_code( $resp );
		$body  = (string) wp_remote_retrieve_body( $resp );
		$fatal = (bool) preg_match( '/(Fatal error|There has been a critical error|Parse error)/i', $body );
		return array(
			'ok'      => $code >= 200 && $code < 400 && ! $fatal,
			'code'    => $code,
			'message' => $fatal ? 'Fatal error shown on homepage' : ( $code >= 400 ? 'HTTP ' . $code : 'OK' ),
		);
	}

	/**
	 * Purge common page caches.
	 */
	public static function purge_caches() {
		$done = array();
		if ( function_exists( 'sg_cachepress_purge_cache' ) ) {
			sg_cachepress_purge_cache();
			$done[] = 'SiteGround';
		}
		if ( function_exists( 'rocket_clean_domain' ) ) {
			rocket_clean_domain();
			$done[] = 'WP Rocket';
		}
		if ( function_exists( 'w3tc_flush_all' ) ) {
			w3tc_flush_all();
			$done[] = 'W3 Total Cache';
		}
		if ( has_action( 'litespeed_purge_all' ) ) {
			do_action( 'litespeed_purge_all' );
			$done[] = 'LiteSpeed';
		}
		if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->files_manager ) ) {
			\Elementor\Plugin::$instance->files_manager->clear_cache();
			$done[] = 'Elementor CSS';
		}
		wp_cache_flush();
		$done[] = 'Object cache';
		return $done;
	}
}
