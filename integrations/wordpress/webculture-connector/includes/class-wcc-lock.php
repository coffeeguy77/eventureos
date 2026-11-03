<?php
/**
 * Site lockdown for unpaid hosting.
 *
 * When the command centre locks a site, every public page returns "503 Service Unavailable" (so search engines
 * keep the site's rankings) with a page explaining it's temporarily unavailable and a button to pay the
 * outstanding invoice. Unlocking (automatically when the invoice is paid) restores the site instantly.
 *
 * Still works while locked: wp-admin and login (for administrators), the REST API (so the command centre can
 * unlock), WP-Cron and AJAX. Logged-in administrators can browse the site normally and see a notice.
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

class WCC_Lock {

	const OPTION = 'wcc_lock';

	public static function init() {
		add_action( 'template_redirect', array( __CLASS__, 'maybe_block' ), 0 );
		add_action( 'admin_notices', array( __CLASS__, 'admin_notice' ) );
		add_action( 'admin_bar_menu', array( __CLASS__, 'admin_bar' ), 100 );
	}

	public static function get() {
		$s = get_option( self::OPTION, array() );
		return is_array( $s ) ? $s : array();
	}

	public static function is_locked() {
		$s = self::get();
		return ! empty( $s['locked'] );
	}

	/**
	 * Lock the site.
	 *
	 * @param array $args pay_url, message, amount, invoice, provider, contact_email, contact_phone.
	 * @return array|WP_Error
	 */
	public static function lock( $args ) {
		$pay = isset( $args['pay_url'] ) ? esc_url_raw( (string) $args['pay_url'] ) : '';
		if ( $pay && 0 !== strpos( $pay, 'https://' ) ) {
			return new WP_Error( 'wcc_pay_url', 'The payment link must start with https://', array( 'status' => 400 ) );
		}
		$state = array(
			'locked'        => true,
			'since'         => time(),
			'pay_url'       => $pay,
			'message'       => sanitize_textarea_field( (string) ( $args['message'] ?? '' ) ),
			'amount'        => sanitize_text_field( (string) ( $args['amount'] ?? '' ) ),
			'invoice'       => sanitize_text_field( (string) ( $args['invoice'] ?? '' ) ),
			'provider'      => sanitize_text_field( (string) ( $args['provider'] ?? 'Web Culture' ) ),
			'contact_email' => sanitize_email( (string) ( $args['contact_email'] ?? '' ) ),
			'contact_phone' => sanitize_text_field( (string) ( $args['contact_phone'] ?? '' ) ),
			'reason'        => sanitize_text_field( (string) ( $args['reason'] ?? 'billing' ) ),
		);
		update_option( self::OPTION, $state, true );
		if ( class_exists( 'WCC_Maintenance' ) ) {
			WCC_Maintenance::purge_caches();
			WCC_Maintenance::log( 'lock', 'Site locked' . ( $state['invoice'] ? ' – invoice ' . $state['invoice'] . ' unpaid' : '' ) . '.' );
		}
		return $state;
	}

	public static function unlock( $note = '' ) {
		$was = self::is_locked();
		delete_option( self::OPTION );
		if ( class_exists( 'WCC_Maintenance' ) ) {
			WCC_Maintenance::purge_caches();
			if ( $was ) {
				WCC_Maintenance::log( 'unlock', 'Site unlocked' . ( $note ? ' – ' . sanitize_text_field( $note ) : '' ) . '.' );
			}
		}
		return array( 'locked' => false, 'was_locked' => $was );
	}

	/**
	 * Requests that must keep working while locked.
	 */
	private static function exempt() {
		if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || ( defined( 'WP_CLI' ) && WP_CLI ) ) {
			return true;
		}
		if ( current_user_can( 'manage_options' ) ) {
			return true;
		}
		$path = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : ''; // phpcs:ignore
		if ( false !== strpos( $path, 'wp-login.php' ) || false !== strpos( $path, '/wp-json/' ) || false !== strpos( $path, 'rest_route=' ) ) {
			return true;
		}
		return false;
	}

	public static function maybe_block() {
		if ( ! self::is_locked() || self::exempt() ) {
			return;
		}
		$s = self::get();
		nocache_headers();
		status_header( 503 );
		header( 'Retry-After: 3600' );
		header( 'X-Robots-Tag: noindex' );
		header( 'Content-Type: text/html; charset=utf-8' );
		self::render( $s );
		exit;
	}

	private static function render( $s ) {
		$site     = get_bloginfo( 'name' );
		$provider = $s['provider'] ? $s['provider'] : 'Web Culture';
		$message  = $s['message'] ? $s['message'] : 'This website is temporarily unavailable. It will be back online as soon as the account is brought up to date.';
		$icon     = get_site_icon_url( 96 );
		?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title><?php echo esc_html( $site ); ?> – temporarily unavailable</title>
<style>
	:root { --bg:#f4f5f7; --card:#ffffff; --ink:#111827; --muted:#4b5563; --line:#e5e7eb; --accent:#1d4ed8; --accent-ink:#ffffff; }
	@media (prefers-color-scheme: dark) { :root { --bg:#0f172a; --card:#1e293b; --ink:#f1f5f9; --muted:#cbd5e1; --line:#334155; --accent:#3b82f6; --accent-ink:#ffffff; } }
	* { box-sizing: border-box; }
	body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; background:var(--bg); color:var(--ink); font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; }
	.card { width:100%; max-width:520px; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:32px 28px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,.08); }
	.logo { width:56px; height:56px; border-radius:12px; margin:0 auto 14px; display:block; }
	h1 { font-size:22px; margin:0 0 8px; }
	p { margin:0 0 14px; color:var(--muted); }
	.owner { margin-top:22px; padding-top:18px; border-top:1px solid var(--line); }
	.owner strong { color:var(--ink); }
	.btn { display:inline-block; margin-top:6px; padding:12px 22px; border-radius:8px; background:var(--accent); color:var(--accent-ink); font-weight:700; text-decoration:none; }
	.btn:focus-visible { outline:3px solid var(--ink); outline-offset:2px; }
	.small { font-size:13px; }
	a { color:var(--accent); }
</style>
</head>
<body>
<main class="card">
	<?php if ( $icon ) : ?><img class="logo" src="<?php echo esc_url( $icon ); ?>" alt=""><?php endif; ?>
	<h1><?php echo esc_html( $site ); ?></h1>
	<p><?php echo esc_html( $message ); ?></p>
	<div class="owner">
		<p><strong>Are you the site owner?</strong><br>
		<?php if ( $s['invoice'] || $s['amount'] ) : ?>
			Invoice <?php echo esc_html( $s['invoice'] ); ?><?php echo $s['amount'] ? ' for ' . esc_html( $s['amount'] ) : ''; ?> from <?php echo esc_html( $provider ); ?> is overdue.
		<?php else : ?>
			There is an overdue account with <?php echo esc_html( $provider ); ?>.
		<?php endif; ?>
		Once it's paid the site comes back online automatically.</p>
		<?php if ( $s['pay_url'] ) : ?>
			<a class="btn" href="<?php echo esc_url( $s['pay_url'] ); ?>">Pay now</a>
		<?php endif; ?>
		<?php if ( $s['contact_email'] || $s['contact_phone'] ) : ?>
			<p class="small" style="margin-top:16px">Questions? <?php if ( $s['contact_email'] ) : ?><a href="mailto:<?php echo esc_attr( $s['contact_email'] ); ?>"><?php echo esc_html( $s['contact_email'] ); ?></a><?php endif; ?><?php echo ( $s['contact_email'] && $s['contact_phone'] ) ? ' · ' : ''; ?><?php if ( $s['contact_phone'] ) : ?><a href="tel:<?php echo esc_attr( preg_replace( '/[^0-9+]/', '', $s['contact_phone'] ) ); ?>"><?php echo esc_html( $s['contact_phone'] ); ?></a><?php endif; ?></p>
		<?php endif; ?>
	</div>
</main>
</body>
</html>
		<?php
	}

	public static function admin_notice() {
		if ( ! self::is_locked() || ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$s = self::get();
		echo '<div class="notice notice-error"><p><strong>This website is locked for visitors</strong> because ' . ( $s['invoice'] ? 'invoice ' . esc_html( $s['invoice'] ) . ' from ' . esc_html( $s['provider'] ) . ' is overdue' : 'the hosting account is overdue' ) . '. Visitors see a "temporarily unavailable" page. ';
		if ( $s['pay_url'] ) {
			echo '<a href="' . esc_url( $s['pay_url'] ) . '" target="_blank" rel="noopener">Pay now</a> – the site unlocks automatically once paid.';
		}
		echo '</p></div>';
	}

	public static function admin_bar( $bar ) {
		if ( ! self::is_locked() || ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$bar->add_node(
			array(
				'id'    => 'wcc-locked',
				'title' => '<span style="background:#b91c1c;color:#fff;padding:2px 8px;border-radius:3px">Site locked for visitors</span>',
				'href'  => admin_url( 'tools.php?page=webculture-connector' ),
			)
		);
	}
}
