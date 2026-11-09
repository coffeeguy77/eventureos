<?php
/**
 * Remote deployment of a theme or plugin package from the Web Culture command centre.
 *
 * The command centre sends a .zip (base64-encoded in the request body); this installs
 * it with WordPress's own upgrader, overwriting any existing copy of the same folder,
 * and can activate the result. Caches are purged afterwards.
 *
 * Only callers that pass WCC_Auth (a signed command-centre request, or a logged-in
 * administrator with update rights) can reach this — the same trust level WordPress
 * already grants an admin uploading a theme in wp-admin.
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

class WCC_Deploy {

	/**
	 * Install a theme or plugin from a base64-encoded zip.
	 *
	 * @param string $type     'theme' or 'plugin'.
	 * @param string $zip_b64  Base64 of the .zip package.
	 * @param bool   $activate Activate after install.
	 * @param string $slug     Expected folder slug (used for activation / verification).
	 * @return array|WP_Error
	 */
	public static function install( $type, $zip_b64, $activate = false, $slug = '' ) {
		if ( ! in_array( $type, array( 'theme', 'plugin' ), true ) ) {
			return new WP_Error( 'wcc_deploy_type', 'type must be "theme" or "plugin".', array( 'status' => 400 ) );
		}

		$raw = base64_decode( (string) $zip_b64, true );
		if ( false === $raw || strlen( $raw ) < 100 ) {
			return new WP_Error( 'wcc_deploy_zip', 'Package missing or not valid base64.', array( 'status' => 400 ) );
		}
		if ( "PK\x03\x04" !== substr( $raw, 0, 4 ) ) {
			return new WP_Error( 'wcc_deploy_zip', 'Package is not a .zip file.', array( 'status' => 400 ) );
		}

		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/misc.php';
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		require_once ABSPATH . 'wp-admin/includes/theme.php';
		require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';

		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 300 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}

		if ( ! WP_Filesystem() ) {
			return new WP_Error(
				'wcc_fs',
				'WordPress cannot write to its files directly here (filesystem method: ' . get_filesystem_method() . ').',
				array( 'status' => 500 )
			);
		}

		$tmp = wp_tempnam( 'wcc-deploy.zip' );
		if ( ! $tmp || false === file_put_contents( $tmp, $raw ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			return new WP_Error( 'wcc_deploy_tmp', 'Could not stage the package on disk.', array( 'status' => 500 ) );
		}
		unset( $raw );

		$skin = new WP_Ajax_Upgrader_Skin();
		// overwrite_package => true makes the upgrader clear the existing folder, so an
		// already-installed theme/plugin of the same slug is replaced rather than erroring.
		$args = array( 'overwrite_package' => true, 'clear_update_cache' => true );

		if ( 'theme' === $type ) {
			$upgrader = new Theme_Upgrader( $skin );
		} else {
			$upgrader = new Plugin_Upgrader( $skin );
		}
		$result = $upgrader->install( $tmp, $args );

		@unlink( $tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged

		$errors = $skin->get_errors();
		if ( is_wp_error( $result ) ) {
			return new WP_Error( 'wcc_deploy_failed', $result->get_error_message(), array( 'status' => 500, 'messages' => $skin->get_upgrade_messages() ) );
		}
		if ( is_wp_error( $errors ) && $errors->has_errors() ) {
			return new WP_Error( 'wcc_deploy_failed', $errors->get_error_message(), array( 'status' => 500, 'messages' => $skin->get_upgrade_messages() ) );
		}
		if ( true !== $result ) {
			return new WP_Error( 'wcc_deploy_failed', 'Install did not complete.', array( 'status' => 500, 'messages' => $skin->get_upgrade_messages() ) );
		}

		$installed = '';
		if ( is_array( $upgrader->result ) && ! empty( $upgrader->result['destination_name'] ) ) {
			$installed = (string) $upgrader->result['destination_name'];
		} elseif ( $slug ) {
			$installed = $slug;
		}

		$activated = false;
		if ( $activate && $installed ) {
			if ( 'theme' === $type ) {
				switch_theme( $installed );
				$activated = ( get_stylesheet() === $installed );
			} else {
				$main = self::plugin_main_file( $installed );
				if ( $main ) {
					$activated = ! is_wp_error( activate_plugin( $main ) );
				}
			}
		}

		$purged = array();
		if ( class_exists( 'WCC_Maintenance' ) ) {
			$purged = WCC_Maintenance::purge_caches();
			WCC_Maintenance::log(
				'deploy',
				sprintf( '%s installed: %s (v%s)%s.', ucfirst( $type ), $installed, self::installed_version( $type, $installed ), $activated ? ', activated' : '' )
			);
		}

		return array(
			'ok'        => true,
			'type'      => $type,
			'installed' => $installed,
			'version'   => self::installed_version( $type, $installed ),
			'activated' => $activated,
			'purged'    => $purged,
			'messages'  => $skin->get_upgrade_messages(),
		);
	}

	private static function installed_version( $type, $slug ) {
		if ( ! $slug ) {
			return '';
		}
		if ( 'theme' === $type ) {
			$t = wp_get_theme( $slug );
			return $t->exists() ? (string) $t->get( 'Version' ) : '';
		}
		$plugins = get_plugins( '/' . $slug );
		$first   = is_array( $plugins ) ? reset( $plugins ) : array();
		return isset( $first['Version'] ) ? (string) $first['Version'] : '';
	}

	private static function plugin_main_file( $dir ) {
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$plugins = get_plugins( '/' . $dir );
		if ( ! empty( $plugins ) ) {
			$keys = array_keys( $plugins );
			return $dir . '/' . $keys[0];
		}
		return '';
	}
}
