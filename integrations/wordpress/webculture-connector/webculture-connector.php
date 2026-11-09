<?php
/**
 * Plugin Name:       Web Culture Connector
 * Plugin URI:        https://webculture.au/
 * Description:       Connects this site to the Web Culture maintenance system: software updates, security and health monitoring, cache management, hosting administration, one-click support sign-in, remote theme/plugin deployment, on-server backups and content editing for AI-assisted maintenance. Requests must be signed with the site's key or come from an administrator.
 * Version:           1.4.1
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Web Culture
 * Author URI:        https://webculture.au/
 * License:           GPL-2.0-or-later
 * Text Domain:       webculture-connector
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

define( 'WCC_VERSION', '1.4.1' );
define( 'WCC_FILE', __FILE__ );
define( 'WCC_DIR', plugin_dir_path( __FILE__ ) );

require_once WCC_DIR . 'includes/class-wcc-auth.php';
require_once WCC_DIR . 'includes/class-wcc-maintenance.php';
require_once WCC_DIR . 'includes/class-wcc-rest.php';
require_once WCC_DIR . 'includes/class-wcc-admin.php';
require_once WCC_DIR . 'includes/class-wcc-lock.php';
require_once WCC_DIR . 'includes/class-wcc-updater.php';
require_once WCC_DIR . 'includes/class-wcc-login.php';
require_once WCC_DIR . 'includes/class-wcc-deploy.php';
require_once WCC_DIR . 'includes/class-wcc-backup.php';
require_once WCC_DIR . 'includes/class-wcc-content.php';
require_once WCC_DIR . 'includes/class-wcc-rest-content.php';

WCC_Updater::init();

WCC_Lock::init();

WCC_Login::init();

WCC_Backup::init();

register_activation_hook( __FILE__, array( 'WCC_Auth', 'ensure_key' ) );

add_action( 'rest_api_init', array( 'WCC_Rest', 'register' ) );
add_action( 'rest_api_init', array( 'WCC_Rest_Content', 'register' ) );

if ( is_admin() ) {
	WCC_Admin::init();
}
