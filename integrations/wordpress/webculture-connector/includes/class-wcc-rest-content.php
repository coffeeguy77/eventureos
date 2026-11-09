<?php
/**
 * REST routes for backups and content tools (1.4.0): /wp-json/webculture/v1/backup…, /content…, /elementor…,
 * /media…, /menus…, /site…, /rest, /undo.
 *
 * Same authentication as the rest of the connector. Restoring a backup is signed requests only (the command centre),
 * so a site's own administrators can't roll the database back by accident.
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

class WCC_Rest_Content {

	const NS = 'webculture/v1';

	private static function route( $path, $methods, $cb, $signed_only = false ) {
		register_rest_route(
			self::NS,
			$path,
			array(
				'methods'             => $methods,
				'permission_callback' => array( 'WCC_Auth', $signed_only ? 'check_signed_only' : 'check' ),
				'callback'            => function ( WP_REST_Request $r ) use ( $cb ) {
					$p = (array) $r->get_json_params() + (array) $r->get_query_params();
					try {
						return $cb( $p, (string) ( $p['summary'] ?? '' ) );
					} catch ( Throwable $e ) {
						return new WP_Error( 'wcc_error', $e->getMessage(), array( 'status' => 500 ) );
					}
				},
			)
		);
	}

	public static function register() {
		/* Backups */
		self::route( '/backup/start', 'POST', fn( $p ) => WCC_Backup::start( (string) ( $p['label'] ?? '' ), (string) ( $p['scope'] ?? 'full' ), (int) ( $p['budget'] ?? 20 ) ) );
		self::route( '/backup/step', 'POST', fn( $p ) => WCC_Backup::step( (string) ( $p['id'] ?? '' ), (int) ( $p['budget'] ?? 20 ) ) );
		self::route( '/backups', 'GET', fn() => WCC_Backup::all() );
		self::route( '/backup/download-link', 'POST', fn( $p ) => WCC_Backup::download_link( (string) ( $p['id'] ?? '' ), (string) ( $p['part'] ?? 'database.sql.gz' ) ), true );
		self::route( '/backup/delete', 'POST', fn( $p ) => WCC_Backup::delete( (string) ( $p['id'] ?? '' ) ), true );
		self::route( '/backup/restore', 'POST', fn( $p ) => WCC_Backup::restore_database( (string) ( $p['id'] ?? '' ), (int) ( $p['budget'] ?? 20 ) ), true );

		/* Content */
		self::route( '/site/info', 'GET', fn() => WCC_Content::site_info() );
		self::route( '/site/settings', 'POST', fn( $p, $s ) => WCC_Content::save_settings( (array) ( $p['settings'] ?? array() ), $s ) );
		self::route( '/content/list', 'GET', fn( $p ) => WCC_Content::list_items( (string) ( $p['type'] ?? 'any' ), sanitize_text_field( (string) ( $p['search'] ?? '' ) ), (int) ( $p['per_page'] ?? 30 ), (int) ( $p['page'] ?? 1 ) ) );
		self::route( '/content/item', 'GET', fn( $p ) => WCC_Content::get_item( (int) ( $p['id'] ?? 0 ) ) );
		self::route( '/content/item', 'POST', fn( $p, $s ) => WCC_Content::save_item( (array) ( $p['item'] ?? array() ), $s ) );
		self::route( '/content/replace', 'POST', fn( $p, $s ) => WCC_Content::replace_text( (int) ( $p['id'] ?? 0 ), (string) ( $p['find'] ?? '' ), (string) ( $p['replace'] ?? '' ), $s ) );
		self::route( '/elementor/outline', 'GET', fn( $p ) => WCC_Content::outline( (int) ( $p['id'] ?? 0 ) ) );
		self::route( '/elementor/element', 'GET', fn( $p ) => WCC_Content::get_element( (int) ( $p['id'] ?? 0 ), (string) ( $p['path'] ?? '' ) ) );
		self::route( '/elementor/patch', 'POST', fn( $p, $s ) => WCC_Content::patch( (int) ( $p['id'] ?? 0 ), $p['ops'] ?? array(), $s ) );
		self::route( '/media/list', 'GET', fn( $p ) => WCC_Content::list_media( sanitize_text_field( (string) ( $p['search'] ?? '' ) ), (int) ( $p['per_page'] ?? 30 ), array_filter( array_map( 'intval', explode( ',', (string) ( $p['ids'] ?? '' ) ) ) ) ) );
		self::route( '/media/item', 'POST', fn( $p, $s ) => WCC_Content::update_media( (array) ( $p['media'] ?? array() ), $s ) );
		self::route( '/media/upload', 'POST', fn( $p, $s ) => WCC_Content::upload_media( (array) ( $p['media'] ?? array() ), $s ) );
		self::route( '/menus/items', 'GET', fn( $p ) => WCC_Content::menu_items( (int) ( $p['menu'] ?? 0 ) ) );
		self::route( '/menus/item', 'POST', fn( $p, $s ) => WCC_Content::save_menu_item( (array) ( $p['item'] ?? array() ), $s ) );
		self::route( '/rest', 'POST', fn( $p, $s ) => WCC_Content::rest( (string) ( $p['method'] ?? 'GET' ), (string) ( $p['path'] ?? '' ), $p['body'] ?? null, $p['query'] ?? null, $s ) );
		self::route( '/changes', 'GET', fn( $p ) => WCC_Content::changes( (int) ( $p['limit'] ?? 50 ) ) );
		self::route( '/undo', 'POST', fn( $p ) => WCC_Content::undo( (string) ( $p['change_id'] ?? '' ) ) );
	}
}
