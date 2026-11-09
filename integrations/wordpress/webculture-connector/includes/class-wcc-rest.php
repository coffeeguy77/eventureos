<?php
/**
 * REST routes: /wp-json/webculture/v1/...
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

class WCC_Rest {

	const NS = 'webculture/v1';

	public static function register() {
		$auth = array( 'WCC_Auth', 'check' );

		register_rest_route(
			self::NS,
			'/ping',
			array(
				'methods'             => 'GET',
				'permission_callback' => $auth,
				'callback'            => fn() => array(
					'ok'        => true,
					'connector' => WCC_VERSION,
					'site'      => home_url( '/' ),
					'time'      => time(),
				),
			)
		);

		register_rest_route(
			self::NS,
			'/status',
			array(
				'methods'             => 'GET',
				'permission_callback' => $auth,
				'callback'            => fn() => WCC_Maintenance::status(),
			)
		);

		register_rest_route(
			self::NS,
			'/check',
			array(
				'methods'             => 'POST',
				'permission_callback' => $auth,
				'callback'            => fn() => WCC_Maintenance::check_updates(),
			)
		);

		register_rest_route(
			self::NS,
			'/update',
			array(
				'methods'             => 'POST',
				'permission_callback' => $auth,
				'args'                => array(
					'type'  => array(
						'required' => true,
						'type'     => 'string',
						'enum'     => array( 'core', 'plugins', 'themes', 'translations', 'all' ),
					),
					'items' => array(
						'type'    => 'array',
						'items'   => array( 'type' => 'string' ),
						'default' => array(),
					),
				),
				'callback'            => function ( WP_REST_Request $r ) {
					return WCC_Maintenance::update( $r['type'], array_map( 'sanitize_text_field', (array) $r['items'] ) );
				},
			)
		);

		register_rest_route(
			self::NS,
			'/cache/purge',
			array(
				'methods'             => 'POST',
				'permission_callback' => $auth,
				'callback'            => function () {
					$done = WCC_Maintenance::purge_caches();
					WCC_Maintenance::log( 'cache', 'Caches purged: ' . implode( ', ', $done ) );
					return array( 'purged' => $done );
				},
			)
		);

		register_rest_route(
			self::NS,
			'/health',
			array(
				'methods'             => 'GET',
				'permission_callback' => $auth,
				'callback'            => fn() => WCC_Maintenance::health_check(),
			)
		);

		register_rest_route(
			self::NS,
			'/lock',
			array(
				array(
					'methods'             => 'GET',
					'permission_callback' => $auth,
					'callback'            => fn() => WCC_Lock::get() + array( 'locked' => false ),
				),
				array(
					'methods'             => 'POST',
					'permission_callback' => array( 'WCC_Auth', 'check_signed_only' ),
					'callback'            => function ( WP_REST_Request $r ) {
						return WCC_Lock::lock( (array) $r->get_json_params() );
					},
				),
			)
		);

		register_rest_route(
			self::NS,
			'/unlock',
			array(
				'methods'             => 'POST',
				'permission_callback' => array( 'WCC_Auth', 'check_signed_only' ),
				'callback'            => function ( WP_REST_Request $r ) {
					$p = (array) $r->get_json_params();
					return WCC_Lock::unlock( (string) ( $p['note'] ?? '' ) );
				},
			)
		);

		register_rest_route(
			self::NS,
			'/login-link',
			array(
				'methods'             => 'POST',
				'permission_callback' => array( 'WCC_Auth', 'check_signed_only' ),
				'callback'            => array( 'WCC_Login', 'create_link' ),
			)
		);

		register_rest_route(
			self::NS,
			'/log',
			array(
				'methods'             => 'GET',
				'permission_callback' => $auth,
				'args'                => array(
					'limit' => array(
						'type'    => 'integer',
						'default' => 50,
						'minimum' => 1,
						'maximum' => 200,
					),
				),
				'callback'            => fn( WP_REST_Request $r ) => WCC_Maintenance::get_log( (int) $r['limit'] ),
			)
		);

		register_rest_route(
			self::NS,
			'/deploy',
			array(
				'methods'             => 'POST',
				'permission_callback' => $auth,
				'args'                => array(
					'type'     => array(
						'required' => true,
						'type'     => 'string',
						'enum'     => array( 'theme', 'plugin' ),
					),
					'zip'      => array(
						'required' => true,
						'type'     => 'string',
					),
					'activate' => array(
						'type'    => 'boolean',
						'default' => false,
					),
					'slug'     => array(
						'type'    => 'string',
						'default' => '',
					),
				),
				'callback'            => function ( WP_REST_Request $r ) {
					return WCC_Deploy::install(
						(string) $r['type'],
						(string) $r['zip'],
						(bool) $r['activate'],
						sanitize_key( (string) $r['slug'] )
					);
				},
			)
		);
	}
}
