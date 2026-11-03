<?php
/**
 * Self-update from EventureOS: new versions of this plugin appear in Dashboard → Updates like any other plugin
 * (and are picked up by the command centre's "Update everything").
 * Manifest: https://www.eventureos.com.au/downloads/webculture-connector.json
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

class WCC_Updater {

	const MANIFEST = 'https://www.eventureos.com.au/downloads/webculture-connector.json';
	const CACHE    = 'wcc_update_manifest';

	public static function init() {
		add_filter( 'pre_set_site_transient_update_plugins', array( __CLASS__, 'inject' ) );
		add_filter( 'plugins_api', array( __CLASS__, 'info' ), 20, 3 );
		// after an update (or a manual upload) WordPress can keep showing "new version available" for the version
		// already installed — drop that stale notice whenever the update list is read
		add_filter( 'site_transient_update_plugins', array( __CLASS__, 'clean' ) );
	}

	private static function manifest() {
		$m = get_site_transient( self::CACHE );
		if ( is_array( $m ) ) {
			return $m;
		}
		$res = wp_remote_get( self::MANIFEST, array( 'timeout' => 8, 'headers' => array( 'Accept' => 'application/json' ) ) );
		$m   = array();
		if ( ! is_wp_error( $res ) && 200 === (int) wp_remote_retrieve_response_code( $res ) ) {
			$j = json_decode( (string) wp_remote_retrieve_body( $res ), true );
			if ( is_array( $j ) && ! empty( $j['version'] ) && ! empty( $j['package'] ) && 0 === strpos( (string) $j['package'], 'https://www.eventureos.com.au/' ) ) {
				$m = $j;
			}
		}
		set_site_transient( self::CACHE, $m, 6 * HOUR_IN_SECONDS );
		return $m;
	}

	public static function inject( $transient ) {
		if ( ! is_object( $transient ) ) {
			return $transient;
		}
		$m    = self::manifest();
		$file = plugin_basename( WCC_FILE );
		if ( $m && version_compare( $m['version'], WCC_VERSION, '>' ) ) {
			$transient->response[ $file ] = (object) array(
				'slug'        => 'webculture-connector',
				'plugin'      => $file,
				'new_version' => $m['version'],
				'package'     => $m['package'],
				'url'         => 'https://webculture.au/',
				'tested'      => $m['tested'] ?? '',
				'requires'    => $m['requires'] ?? '',
			);
		} elseif ( isset( $transient->response[ $file ] ) ) {
			unset( $transient->response[ $file ] );
		}
		return $transient;
	}

	public static function clean( $transient ) {
		$file = plugin_basename( WCC_FILE );
		if ( is_object( $transient ) && isset( $transient->response[ $file ] ) && version_compare( (string) ( $transient->response[ $file ]->new_version ?? '0' ), WCC_VERSION, '<=' ) ) {
			unset( $transient->response[ $file ] );
		}
		return $transient;
	}

	public static function info( $result, $action, $args ) {
		if ( 'plugin_information' !== $action || ( $args->slug ?? '' ) !== 'webculture-connector' ) {
			return $result;
		}
		$m = self::manifest();
		return (object) array(
			'name'          => 'Web Culture Connector',
			'slug'          => 'webculture-connector',
			'version'       => $m['version'] ?? WCC_VERSION,
			'author'        => 'Web Culture',
			'homepage'      => 'https://webculture.au/',
			'download_link' => $m['package'] ?? '',
			'sections'      => array( 'description' => 'Connects this site to the Web Culture command centre for updates, health checks and hosting.', 'changelog' => esc_html( $m['changelog'] ?? '' ) ),
		);
	}
}
