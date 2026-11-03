<?php
/**
 * Admin screen: Tools → Web Culture.
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

class WCC_Admin {

	const SLUG = 'webculture-connector';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_post_wcc_action', array( __CLASS__, 'handle' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( WCC_FILE ), array( __CLASS__, 'links' ) );
	}

	public static function menu() {
		add_management_page( 'Web Culture', 'Web Culture', 'manage_options', self::SLUG, array( __CLASS__, 'render' ) );
	}

	public static function links( $links ) {
		if ( class_exists( 'WCC_Lock' ) && WCC_Lock::is_locked() ) {
			unset( $links['deactivate'] );
		}
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'tools.php?page=' . self::SLUG ) ) . '">Settings</a>' );
		return $links;
	}

	public static function handle() {
		if ( ! current_user_can( 'manage_options' ) || ! current_user_can( 'update_plugins' ) ) {
			wp_die( 'Not allowed.' );
		}
		check_admin_referer( 'wcc_action' );
		$do  = sanitize_key( $_POST['do'] ?? '' );
		$msg = '';
		switch ( $do ) {
			case 'check':
				WCC_Maintenance::check_updates();
				$msg = 'Checked for updates.';
				break;
			case 'update_all':
				$r   = WCC_Maintenance::update( 'all' );
				$msg = is_wp_error( $r ) ? $r->get_error_message() : $r['summary'];
				break;
			case 'purge':
				$msg = 'Caches purged: ' . implode( ', ', WCC_Maintenance::purge_caches() );
				WCC_Maintenance::log( 'cache', $msg );
				break;
			case 'support_login':
				update_option( WCC_Login::OPT_ON, empty( $_POST['on'] ) ? '0' : '1', false );
				$uid = absint( $_POST['user'] ?? 0 );
				$u   = $uid ? get_userdata( $uid ) : null;
				update_option( WCC_Login::OPT_USER, ( $u && in_array( 'administrator', (array) $u->roles, true ) ) ? $uid : 0, false );
				WCC_Maintenance::log( 'settings', 'Support sign-in ' . ( empty( $_POST['on'] ) ? 'switched off' : 'switched on' ) . '.' );
				$msg = 'Support sign-in settings saved.';
				break;
			case 'rotate':
				WCC_Auth::rotate_key();
				$msg = 'New connection key created. Update it in the command centre.';
				break;
		}
		set_transient( 'wcc_notice_' . get_current_user_id(), $msg, 60 );
		wp_safe_redirect( admin_url( 'tools.php?page=' . self::SLUG ) );
		exit;
	}

	private static function button( $do, $label, $class = '', $confirm = '' ) {
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"' . ( $confirm ? ' onsubmit="return confirm(\'' . esc_js( $confirm ) . '\')"' : '' ) . '>';
		wp_nonce_field( 'wcc_action' );
		echo '<input type="hidden" name="action" value="wcc_action"><input type="hidden" name="do" value="' . esc_attr( $do ) . '">';
		echo '<button type="submit" class="wcc-btn ' . esc_attr( $class ) . '">' . esc_html( $label ) . '</button></form>';
	}

	public static function render() {
		$s      = WCC_Maintenance::status();
		$key    = WCC_Auth::get_key();
		$notice = get_transient( 'wcc_notice_' . get_current_user_id() );
		delete_transient( 'wcc_notice_' . get_current_user_id() );
		$env    = $s['environment'];
		$upd    = $s['updates'];
		$total  = $upd['core'] + $upd['plugins'] + $upd['themes'];
		?>
		<style>
			.wcc { --wcc-surface:#ffffff; --wcc-canvas:#f3f4f6; --wcc-ink:#111827; --wcc-muted:#6b7280; --wcc-line:#e5e7eb; --wcc-accent:#2563eb; --wcc-accent-ink:#ffffff; --wcc-ok:#047857; --wcc-warn:#b45309; --wcc-bad:#b91c1c; color:var(--wcc-ink); background:var(--wcc-canvas); max-width:1100px; margin-top:12px; padding:16px 20px 24px; border-radius:10px; }
			@media (prefers-color-scheme: dark) {
				.wcc { --wcc-surface:#1f2937; --wcc-canvas:#111827; --wcc-ink:#f3f4f6; --wcc-muted:#9ca3af; --wcc-line:#374151; --wcc-accent:#3b82f6; --wcc-accent-ink:#ffffff; --wcc-ok:#34d399; --wcc-warn:#fbbf24; --wcc-bad:#f87171; }
			}
			.wcc h1 { color:var(--wcc-ink); padding-top:4px; }
			.wcc code { background:var(--wcc-surface); color:var(--wcc-ink); }
			.wcc-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin:16px 0; }
			.wcc-card { background:var(--wcc-surface); border:1px solid var(--wcc-line); border-radius:8px; padding:16px; color:var(--wcc-ink); }
			.wcc-card h2 { margin:0 0 8px; font-size:14px; color:var(--wcc-muted); font-weight:600; }
			.wcc-big { font-size:22px; font-weight:700; }
			.wcc-muted { color:var(--wcc-muted); }
			.wcc-ok { color:var(--wcc-ok); } .wcc-warn { color:var(--wcc-warn); } .wcc-bad { color:var(--wcc-bad); }
			.wcc-actions { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 4px; }
			.wcc-actions form { margin:0; }
			.wcc-btn { min-height:40px; padding:8px 16px; border-radius:6px; border:1px solid var(--wcc-line); background:var(--wcc-canvas); color:var(--wcc-ink); font-weight:600; cursor:pointer; }
			.wcc-btn--primary { background:var(--wcc-accent); border-color:var(--wcc-accent); color:var(--wcc-accent-ink); }
			.wcc-btn:hover { filter:brightness(1.08); }
			.wcc-key { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
			.wcc-key input { flex:1 1 320px; min-height:40px; font-family:monospace; background:var(--wcc-canvas); color:var(--wcc-ink); border:1px solid var(--wcc-line); border-radius:6px; padding:6px 10px; }
			.wcc-table { width:100%; border-collapse:collapse; }
			.wcc-table th, .wcc-table td { text-align:left; padding:8px; border-bottom:1px solid var(--wcc-line); vertical-align:top; }
			.wcc-table th { color:var(--wcc-muted); font-weight:600; }
			.wcc-notice { background:var(--wcc-surface); border-left:4px solid var(--wcc-accent); padding:10px 14px; margin:12px 0; color:var(--wcc-ink); }
			@media (max-width:640px) {
				.wcc { padding:12px; margin-right:10px; }
				.wcc-table thead { display:none; }
				.wcc-table tr { display:block; padding:8px 0; border-bottom:1px solid var(--wcc-line); }
				.wcc-table td { display:block; border:0; padding:2px 0; }
				.wcc-btn { width:100%; }
				.wcc-actions form { flex:1 1 100%; }
			}
		</style>
		<div class="wrap wcc">
			<h1>Web Culture</h1>
			<p class="wcc-muted">This site is maintained by Web Culture. This connector lets our command centre check the site and run updates.</p>
			<?php if ( $notice ) : ?>
				<div class="wcc-notice"><?php echo esc_html( $notice ); ?></div>
			<?php endif; ?>

			<div class="wcc-grid">
				<div class="wcc-card"><h2>Updates waiting</h2><div class="wcc-big <?php echo $total ? 'wcc-warn' : 'wcc-ok'; ?>"><?php echo (int) $total; ?></div>
					<div class="wcc-muted"><?php echo (int) $upd['plugins']; ?> plugins · <?php echo (int) $upd['themes']; ?> themes · <?php echo $upd['core'] ? 'WordPress ' . esc_html( $env['wp_update'] ) : 'WordPress up to date'; ?></div></div>
				<div class="wcc-card"><h2>WordPress</h2><div class="wcc-big"><?php echo esc_html( $env['wp'] ); ?></div><div class="wcc-muted">PHP <?php echo esc_html( $env['php'] ); ?></div></div>
				<?php if ( $s['woocommerce'] ) : ?>
					<div class="wcc-card"><h2>WooCommerce</h2><div class="wcc-big"><?php echo esc_html( $s['woocommerce']['version'] ); ?></div><div class="wcc-muted">Currency <?php echo esc_html( $s['woocommerce']['currency'] ); ?></div></div>
				<?php endif; ?>
				<div class="wcc-card"><h2>Checks</h2>
					<div class="<?php echo $env['https'] ? 'wcc-ok' : 'wcc-bad'; ?>"><?php echo $env['https'] ? 'HTTPS on' : 'HTTPS off'; ?></div>
					<div class="<?php echo $env['debug'] ? 'wcc-warn' : 'wcc-ok'; ?>"><?php echo $env['debug'] ? 'Debug mode on' : 'Debug mode off'; ?></div>
					<div class="<?php echo 'direct' === $env['fs_method'] ? 'wcc-ok' : 'wcc-warn'; ?>">File access: <?php echo esc_html( $env['fs_method'] ); ?></div>
				</div>
			</div>

			<?php if ( class_exists( 'WCC_Lock' ) && WCC_Lock::is_locked() ) : $lk = WCC_Lock::get(); ?>
				<div class="wcc-card" style="border-left:4px solid var(--wcc-bad)">
					<h2>Site locked for visitors</h2>
					<p>Since <?php echo esc_html( wp_date( 'j M Y, g:i a', (int) $lk['since'] ) ); ?><?php echo $lk['invoice'] ? ' · invoice ' . esc_html( $lk['invoice'] ) : ''; ?>. Visitors see a "temporarily unavailable" page. It unlocks automatically when the invoice is paid.</p>
					<?php if ( $lk['pay_url'] ) : ?><p><a class="wcc-btn wcc-btn--primary" style="display:inline-flex;align-items:center;text-decoration:none" href="<?php echo esc_url( $lk['pay_url'] ); ?>" target="_blank" rel="noopener">Pay now</a></p><?php endif; ?>
				</div>
			<?php endif; ?>

			<div class="wcc-actions">
				<?php
				self::button( 'check', 'Check for updates' );
				self::button( 'update_all', 'Update everything', 'wcc-btn--primary', 'Make sure a backup exists. Update WordPress, plugins, themes and translations now?' );
				self::button( 'purge', 'Purge caches' );
				?>
			</div>

			<div class="wcc-card" style="margin-top:16px">
				<h2>Connection key</h2>
				<p class="wcc-muted">Paste this into the site's record in the Web Culture command centre. Keep it private – it allows updates to be run on this site.</p>
				<div class="wcc-key">
					<input type="password" readonly value="<?php echo esc_attr( $key ); ?>" id="wcc-key" aria-label="Connection key">
					<button type="button" class="wcc-btn" onclick="var i=document.getElementById('wcc-key');i.type=i.type==='password'?'text':'password'">Show / hide</button>
					<button type="button" class="wcc-btn" onclick="navigator.clipboard.writeText(document.getElementById('wcc-key').value);this.textContent='Copied'">Copy</button>
				</div>
				<p class="wcc-muted">Site URL: <code><?php echo esc_html( home_url( '/' ) ); ?></code></p>
				<div class="wcc-actions"><?php self::button( 'rotate', 'Create a new key', '', 'The old key will stop working straight away. Continue?' ); ?></div>
			</div>

			<div class="wcc-card" style="margin-top:16px">
				<h2>One-click support sign-in</h2>
				<p class="wcc-muted">Lets Web Culture's support team sign in to help you without needing your password. Each sign-in link is requested by the command centre, works once for 60 seconds, and is recorded in the log below with the staff member's name.</p>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="wcc-key">
					<?php wp_nonce_field( 'wcc_action' ); ?>
					<input type="hidden" name="action" value="wcc_action"><input type="hidden" name="do" value="support_login">
					<label style="display:flex;gap:8px;align-items:center;min-height:40px"><input type="checkbox" name="on" value="1" <?php checked( WCC_Login::enabled() ); ?>> Allow support sign-in</label>
					<label style="display:flex;gap:8px;align-items:center;min-height:40px">Sign in as
						<select name="user" style="min-height:40px;background:var(--wcc-canvas);color:var(--wcc-ink);border:1px solid var(--wcc-line);border-radius:6px">
							<?php $cur = WCC_Login::support_user(); foreach ( get_users( array( 'role' => 'administrator', 'orderby' => 'ID' ) ) as $a ) : ?>
								<option value="<?php echo (int) $a->ID; ?>" <?php selected( $cur && (int) $cur->ID === (int) $a->ID ); ?>><?php echo esc_html( $a->user_login . ' (' . $a->user_email . ')' ); ?></option>
							<?php endforeach; ?>
						</select>
					</label>
					<button type="submit" class="wcc-btn wcc-btn--primary">Save</button>
				</form>
			</div>

			<?php
			$pending = array_filter( $s['plugins'], fn( $p ) => $p['update'] );
			if ( $pending ) :
				?>
				<div class="wcc-card" style="margin-top:16px">
					<h2>Plugin updates</h2>
					<table class="wcc-table"><thead><tr><th>Plugin</th><th>Installed</th><th>Available</th></tr></thead><tbody>
					<?php foreach ( $pending as $p ) : ?>
						<tr><td><?php echo esc_html( $p['name'] ); ?><?php echo false === $p['update_ok'] ? ' <span class="wcc-warn">(licence needed)</span>' : ''; ?></td><td><?php echo esc_html( $p['version'] ); ?></td><td><?php echo esc_html( $p['update'] ); ?></td></tr>
					<?php endforeach; ?>
					</tbody></table>
				</div>
			<?php endif; ?>

			<div class="wcc-card" style="margin-top:16px">
				<h2>Maintenance log</h2>
				<?php $log = WCC_Maintenance::get_log( 20 ); ?>
				<?php if ( ! $log ) : ?>
					<p class="wcc-muted">Nothing yet.</p>
				<?php else : ?>
					<table class="wcc-table"><thead><tr><th>When</th><th>What</th></tr></thead><tbody>
					<?php foreach ( $log as $e ) : ?>
						<tr><td><?php echo esc_html( wp_date( 'j M Y, g:i a', $e['time'] ) ); ?></td><td><?php echo esc_html( $e['message'] ); ?></td></tr>
					<?php endforeach; ?>
					</tbody></table>
				<?php endif; ?>
			</div>
		</div>
		<?php
	}
}
