<?php
/**
 * One-click support sign-in from the Web Culture command centre.
 *
 * The command centre (signed with this site's connection key — nobody else can ask) requests a sign-in link for a
 * named staff member. The link:
 *  - works once, and only for 60 seconds,
 *  - signs in as the chosen support administrator (Tools → Web Culture), never anyone else,
 *  - is written to the maintenance log with the staff member's name.
 * The site owner can switch it off in Tools → Web Culture.
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

class WCC_Login {

	const OPT_ON   = 'wcc_support_login';      // '1' (default) or '0'
	const OPT_USER = 'wcc_support_login_user'; // user ID to sign in as (0 = first administrator)
	const TTL      = 60;

	public static function init() {
		add_action( 'init', array( __CLASS__, 'maybe_sign_in' ), 1 );
	}

	public static function enabled() {
		return '0' !== (string) get_option( self::OPT_ON, '1' );
	}

	/** The administrator support sign-ins use. */
	public static function support_user() {
		$id = (int) get_option( self::OPT_USER, 0 );
		if ( $id ) {
			$u = get_userdata( $id );
			if ( $u && in_array( 'administrator', (array) $u->roles, true ) ) {
				return $u;
			}
		}
		$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'orderby' => 'ID' ) );
		return $admins ? $admins[0] : null;
	}

	/**
	 * REST: create a single-use sign-in link. Signed requests only.
	 *
	 * @param WP_REST_Request $r Request with JSON { who: "Staff name", to: "/wp-admin/..." }.
	 * @return array|WP_Error
	 */
	public static function create_link( WP_REST_Request $r ) {
		if ( ! self::enabled() ) {
			return new WP_Error( 'wcc_login_off', 'One-click support sign-in is switched off on this site (Tools → Web Culture).', array( 'status' => 403 ) );
		}
		$user = self::support_user();
		if ( ! $user ) {
			return new WP_Error( 'wcc_login_user', 'This site has no administrator account to sign in as.', array( 'status' => 409 ) );
		}
		$p     = (array) $r->get_json_params();
		$who   = substr( sanitize_text_field( (string) ( $p['who'] ?? 'Web Culture support' ) ), 0, 80 );
		$to    = (string) ( $p['to'] ?? '' );
		$to    = ( '' !== $to && 0 === strpos( $to, '/' ) && 0 !== strpos( $to, '//' ) ) ? $to : '/wp-admin/';
		$token = bin2hex( random_bytes( 32 ) );
		set_transient(
			'wcc_login_' . hash( 'sha256', $token ),
			array(
				'user' => (int) $user->ID,
				'who'  => $who,
				'to'   => $to,
				'exp'  => time() + self::TTL,
			),
			self::TTL
		);
		return array(
			'url'        => add_query_arg( 'wcc_login', $token, home_url( '/' ) ),
			'expires_in' => self::TTL,
			'as'         => $user->user_login,
		);
	}

	/** Visiting the link: check it, use it up, sign in, go to wp-admin. */
	public static function maybe_sign_in() {
		if ( empty( $_GET['wcc_login'] ) ) {
			return;
		}
		$token = preg_replace( '/[^a-f0-9]/', '', (string) wp_unslash( $_GET['wcc_login'] ) );
		$key   = 'wcc_login_' . hash( 'sha256', $token );
		$data  = 64 === strlen( $token ) ? get_transient( $key ) : false;
		delete_transient( $key ); // single use, whatever happens next
		nocache_headers();
		if ( ! self::enabled() || ! is_array( $data ) || (int) $data['exp'] < time() ) {
			wp_die( esc_html__( 'This sign-in link has expired or has already been used. Ask for a new one from the Web Culture command centre.', 'webculture-connector' ), esc_html__( 'Link expired', 'webculture-connector' ), array( 'response' => 403 ) );
		}
		$user = get_userdata( (int) $data['user'] );
		if ( ! $user || ! in_array( 'administrator', (array) $user->roles, true ) ) {
			wp_die( esc_html__( 'The support account is no longer an administrator.', 'webculture-connector' ), '', array( 'response' => 403 ) );
		}
		wp_clear_auth_cookie();
		wp_set_current_user( $user->ID );
		wp_set_auth_cookie( $user->ID, false, is_ssl() );
		do_action( 'wp_login', $user->user_login, $user );
		WCC_Maintenance::log( 'support_login', sprintf( 'Support sign-in by %s (as %s).', $data['who'], $user->user_login ) );
		$to = (string) $data['to'];
		wp_safe_redirect( 0 === strpos( $to, '/wp-admin' ) ? admin_url( ltrim( substr( $to, 9 ), '/' ) ) : home_url( $to ) );
		exit;
	}
}
