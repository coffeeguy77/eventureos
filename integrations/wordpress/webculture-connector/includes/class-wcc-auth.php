<?php
/**
 * Request authentication.
 *
 * Two ways in:
 *  1. Signed requests from the command centre (HMAC-SHA256 with this site's connection key).
 *     Headers: X-WCC-Timestamp (unix seconds), X-WCC-Nonce (random), X-WCC-Signature (hex)
 *     Signature = hmac_sha256( key, timestamp + "\n" + nonce + "\n" + METHOD + "\n" + /route + "\n" + raw_body )
 *  2. A logged-in administrator (cookie + nonce, or an Application Password) with update rights.
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

class WCC_Auth {

	const OPTION     = 'wcc_connection_key';
	const MAX_SKEW   = 300; // seconds
	const NONCE_TTL  = 600;

	/**
	 * Create a connection key if none exists.
	 */
	public static function ensure_key() {
		if ( ! get_option( self::OPTION ) ) {
			update_option( self::OPTION, self::generate_key(), false );
		}
	}

	public static function generate_key() {
		return 'wcc_' . bin2hex( random_bytes( 32 ) );
	}

	public static function get_key() {
		self::ensure_key();
		return (string) get_option( self::OPTION );
	}

	public static function rotate_key() {
		update_option( self::OPTION, self::generate_key(), false );
		WCC_Maintenance::log( 'key_rotated', 'Connection key regenerated.' );
	}

	/**
	 * REST permission callback.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return true|WP_Error
	 */
	public static function check( WP_REST_Request $request ) {
		$sig = $request->get_header( 'x_wcc_signature' );
		if ( $sig ) {
			return self::check_signature( $request, $sig );
		}
		if ( current_user_can( 'update_plugins' ) && current_user_can( 'manage_options' ) ) {
			return true;
		}
		return new WP_Error( 'wcc_forbidden', 'Not authorised.', array( 'status' => is_user_logged_in() ? 403 : 401 ) );
	}

	/**
	 * Lock / unlock: only the command centre (signed with the connection key) may do this – not the site's own
	 * administrators, otherwise a client could unlock their own overdue site.
	 */
	public static function check_signed_only( WP_REST_Request $request ) {
		$sig = $request->get_header( 'x_wcc_signature' );
		if ( ! $sig ) {
			return new WP_Error( 'wcc_forbidden', 'Only the Web Culture command centre can do this.', array( 'status' => 403 ) );
		}
		return self::check_signature( $request, $sig );
	}

	private static function check_signature( WP_REST_Request $request, $sig ) {
		$ts    = (int) $request->get_header( 'x_wcc_timestamp' );
		$nonce = (string) $request->get_header( 'x_wcc_nonce' );

		if ( ! $ts || abs( time() - $ts ) > self::MAX_SKEW ) {
			return new WP_Error( 'wcc_stale', 'Request timestamp is missing or too old.', array( 'status' => 401 ) );
		}
		if ( ! preg_match( '/^[A-Za-z0-9_-]{16,64}$/', $nonce ) ) {
			return new WP_Error( 'wcc_nonce', 'Invalid nonce.', array( 'status' => 401 ) );
		}

		$route    = '/' . ltrim( $request->get_route(), '/' );
		$payload  = $ts . "\n" . $nonce . "\n" . strtoupper( $request->get_method() ) . "\n" . $route . "\n" . $request->get_body();
		$expected = hash_hmac( 'sha256', $payload, self::get_key() );

		if ( ! hash_equals( $expected, strtolower( (string) $sig ) ) ) {
			return new WP_Error( 'wcc_signature', 'Invalid signature.', array( 'status' => 401 ) );
		}

		// Replay protection.
		$nonce_key = 'wcc_n_' . md5( $nonce );
		if ( get_transient( $nonce_key ) ) {
			return new WP_Error( 'wcc_replay', 'Nonce already used.', array( 'status' => 401 ) );
		}
		set_transient( $nonce_key, 1, self::NONCE_TTL );

		// Run the request as the first administrator so capability checks inside WordPress pass.
		$admins = get_users(
			array(
				'role'    => 'administrator',
				'number'  => 1,
				'orderby' => 'ID',
				'fields'  => 'ID',
			)
		);
		if ( $admins ) {
			wp_set_current_user( (int) $admins[0] );
		}
		return true;
	}
}
