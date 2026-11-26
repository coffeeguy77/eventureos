<?php
/**
 * SEO + AI search (1.5.0).
 *
 * Works alongside whichever SEO plugin the site has — Yoast, Rank Math or SEOPress — writing into that plugin's own
 * fields, and stands in for one when there is none (its own title, description, robots and Open Graph tags).
 * All in one option, wcc_seo, set from the Web Culture command centre:
 *   - per-page titles, descriptions, focus keywords, noindex and image alt text (every change logged with an undo copy)
 *   - an audit that loads each public page the way a visitor sees it and reports what search engines and AI tools read
 *   - hiding builder/template post types from search and sitemaps (headers, footers, Elementor templates…)
 *   - a business profile output as schema.org JSON-LD, FAQ schema built from <details><summary> FAQs on a page
 *   - /llms.txt (a plain-text guide to the site for AI tools) when no llms.txt file is on the server
 *   - AI crawler rules in robots.txt (GPTBot, ClaudeBot, PerplexityBot …) and search engine verification tags
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

class WCC_Seo {

	const OPT = 'wcc_seo';

	/** AI crawlers named in robots.txt when the site welcomes (or blocks) them. */
	const AI_BOTS = array( 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'meta-externalagent', 'Amazonbot', 'DuckAssistBot', 'MistralAI-User' );

	/** Post types that are page-builder parts, never pages in their own right. */
	const BUILDER_TYPES = '/^(elementor_library|e-floating-buttons|elementor-hf|ae_global_templates|jet-|fl-builder-template|et_pb_layout|wp_block|wp_template|wp_navigation|flexitype|.*[-_]hf$|.*[-_]template[s]?$|.*_builder$|oceanwp_library|astra-advanced-hook|kadence_element|gp_elements|ct_template|brizy_template|tb_.*|uicore-tb)/i';

	private static $faq = array();

	/* ------------------------------------------------------------------ */
	/* Settings                                                             */
	/* ------------------------------------------------------------------ */

	public static function defaults() {
		return array(
			'business'       => array(
				'type'        => 'LocalBusiness',
				'name'        => '',
				'description' => '',
				'phone'       => '',
				'email'       => '',
				'street'      => '',
				'locality'    => '',
				'region'      => '',
				'postcode'    => '',
				'country'     => 'AU',
				'founded'     => '',
				'logo'        => '',
				'image'       => '',
				'price_range' => '',
				'area'        => array(),
				'services'    => array(),
				'same_as'     => array(),
			),
			'schema'         => false,
			'faq_schema'     => false,
			'llms'           => false,
			'llms_intro'     => '',
			'llms_pages'     => array(),
			'ai_crawlers'    => 'default',
			'noindex_types'  => array(),
			'verify_google'  => '',
			'verify_bing'    => '',
			'h1_class'       => '',
			'alt_fill'       => false,
			'updated'        => 0,
		);
	}

	public static function settings() {
		$s = get_option( self::OPT, array() );
		$s = is_array( $s ) ? $s : array();
		$d = self::defaults();
		$out = array_merge( $d, $s );
		$out['business'] = array_merge( $d['business'], is_array( $s['business'] ?? null ) ? $s['business'] : array() );
		return $out;
	}

	private static function clean_list( $v, $max = 40, $len = 200 ) {
		$out = array();
		foreach ( (array) $v as $x ) {
			if ( is_array( $x ) ) {
				$name = sanitize_text_field( (string) ( $x['name'] ?? '' ) );
				if ( '' === $name ) {
					continue;
				}
				$row = array( 'name' => mb_substr( $name, 0, $len ) );
				if ( ! empty( $x['url'] ) ) {
					$row['url'] = esc_url_raw( (string) $x['url'] );
				}
				if ( ! empty( $x['description'] ) ) {
					$row['description'] = mb_substr( sanitize_text_field( (string) $x['description'] ), 0, 300 );
				}
				$out[] = $row;
			} else {
				$t = sanitize_text_field( (string) $x );
				if ( '' !== $t ) {
					$out[] = mb_substr( $t, 0, $len );
				}
			}
			if ( count( $out ) >= $max ) {
				break;
			}
		}
		return $out;
	}

	public static function save_settings( $p, $summary ) {
		$cur  = self::settings();
		$next = $cur;
		if ( isset( $p['business'] ) && is_array( $p['business'] ) ) {
			$b = $p['business'];
			foreach ( array( 'type', 'name', 'phone', 'email', 'street', 'locality', 'region', 'postcode', 'country', 'founded', 'price_range' ) as $k ) {
				if ( isset( $b[ $k ] ) ) {
					$next['business'][ $k ] = mb_substr( sanitize_text_field( (string) $b[ $k ] ), 0, 160 );
				}
			}
			if ( isset( $b['type'] ) && ! preg_match( '/^[A-Za-z]{3,40}$/', $next['business']['type'] ) ) {
				$next['business']['type'] = 'LocalBusiness';
			}
			if ( isset( $b['description'] ) ) {
				$next['business']['description'] = mb_substr( sanitize_textarea_field( (string) $b['description'] ), 0, 600 );
			}
			foreach ( array( 'logo', 'image' ) as $k ) {
				if ( isset( $b[ $k ] ) ) {
					$next['business'][ $k ] = esc_url_raw( (string) $b[ $k ] );
				}
			}
			if ( isset( $b['area'] ) ) {
				$next['business']['area'] = self::clean_list( $b['area'], 20, 80 );
			}
			if ( isset( $b['services'] ) ) {
				$next['business']['services'] = self::clean_list( $b['services'], 30, 120 );
			}
			if ( isset( $b['same_as'] ) ) {
				$next['business']['same_as'] = array_values( array_filter( array_map( 'esc_url_raw', array_map( 'strval', (array) $b['same_as'] ) ) ) );
			}
		}
		if ( isset( $p['h1_class'] ) ) {
			$next['h1_class'] = preg_match( '/^[A-Za-z][A-Za-z0-9_-]{1,60}$/', (string) $p['h1_class'] ) ? (string) $p['h1_class'] : '';
		}
		foreach ( array( 'schema', 'faq_schema', 'llms', 'alt_fill' ) as $k ) {
			if ( isset( $p[ $k ] ) ) {
				$next[ $k ] = (bool) $p[ $k ];
			}
		}
		if ( isset( $p['llms_intro'] ) ) {
			$next['llms_intro'] = mb_substr( sanitize_textarea_field( (string) $p['llms_intro'] ), 0, 1500 );
		}
		if ( isset( $p['llms_pages'] ) ) {
			$next['llms_pages'] = array_slice( array_values( array_filter( array_map( 'intval', (array) $p['llms_pages'] ) ) ), 0, 80 );
		}
		if ( isset( $p['ai_crawlers'] ) && in_array( $p['ai_crawlers'], array( 'default', 'allow', 'block' ), true ) ) {
			$next['ai_crawlers'] = $p['ai_crawlers'];
		}
		if ( isset( $p['noindex_types'] ) ) {
			$types = array();
			foreach ( (array) $p['noindex_types'] as $t ) {
				$t = sanitize_key( (string) $t );
				if ( $t && ! in_array( $t, array( 'page', 'post' ), true ) && post_type_exists( $t ) ) {
					$types[] = $t;
				}
			}
			$next['noindex_types'] = array_values( array_unique( $types ) );
		}
		foreach ( array( 'verify_google', 'verify_bing' ) as $k ) {
			if ( isset( $p[ $k ] ) ) {
				$v = trim( (string) $p[ $k ] );
				// accept the whole meta tag, a DNS-style "google-site-verification=…" value, or just the code
				if ( preg_match( '/content=["\']([^"\']+)["\']/', $v, $m ) ) {
					$v = $m[1];
				}
				$v          = preg_replace( '/^(google-site-verification|msvalidate\.01)=/', '', $v );
				$next[ $k ] = preg_replace( '/[^A-Za-z0-9_\-]/', '', $v );
			}
		}
		$next['updated'] = time();
		if ( $next === $cur ) {
			return array( 'changed' => false, 'settings' => $cur );
		}
		$change_id = WCC_Content::change_id();
		$undo      = (array) get_option( WCC_Content::UNDO_OPT, array() );
		array_unshift( $undo, array( 'id' => $change_id, 'time' => time(), 'summary' => $summary ? $summary : 'Changed SEO settings', 'prev' => array( self::OPT => get_option( self::OPT, array() ) ) ) );
		update_option( WCC_Content::UNDO_OPT, array_slice( $undo, 0, 20 ), false );
		update_option( self::OPT, $next, true );
		WCC_Maintenance::purge_caches();
		WCC_Content::log_change( $change_id, $summary ? $summary : 'Changed SEO settings' );
		return array( 'changed' => true, 'change_id' => $change_id, 'settings' => $next );
	}

	/* ------------------------------------------------------------------ */
	/* Per-page SEO fields, whichever plugin holds them                     */
	/* ------------------------------------------------------------------ */

	public static function plugin() {
		return WCC_Content::seo_plugin();
	}

	private static function keys() {
		switch ( self::plugin() ) {
			case 'yoast':
				return array( 'title' => '_yoast_wpseo_title', 'description' => '_yoast_wpseo_metadesc', 'focus_keyword' => '_yoast_wpseo_focuskw', 'noindex' => '_yoast_wpseo_meta-robots-noindex' );
			case 'rankmath':
				return array( 'title' => 'rank_math_title', 'description' => 'rank_math_description', 'focus_keyword' => 'rank_math_focus_keyword', 'noindex' => 'rank_math_robots' );
			case 'seopress':
				return array( 'title' => '_seopress_titles_title', 'description' => '_seopress_titles_desc', 'focus_keyword' => '_seopress_analysis_target_kw', 'noindex' => '_seopress_robots_index' );
			case 'aioseo':
				return array(); // All in One SEO keeps its fields in its own table — read-only here
		}
		return array( 'title' => '_wcc_seo_title', 'description' => '_wcc_seo_desc', 'focus_keyword' => '_wcc_seo_focus', 'noindex' => '_wcc_noindex' );
	}

	public static function fields( $post_id ) {
		$k = self::keys();
		if ( ! $k ) {
			return array( 'plugin' => 'aioseo', 'title' => '', 'description' => '', 'focus_keyword' => '', 'noindex' => false, 'writable' => false );
		}
		$noindex = get_post_meta( $post_id, $k['noindex'], true );
		if ( 'rankmath' === self::plugin() ) {
			$noindex = is_array( $noindex ) && in_array( 'noindex', $noindex, true );
		} elseif ( 'seopress' === self::plugin() ) {
			$noindex = 'yes' === $noindex;
		} else {
			$noindex = '1' === (string) $noindex;
		}
		return array(
			'plugin'        => self::plugin() ? self::plugin() : 'connector',
			'title'         => (string) get_post_meta( $post_id, $k['title'], true ),
			'description'   => (string) get_post_meta( $post_id, $k['description'], true ),
			'focus_keyword' => (string) get_post_meta( $post_id, $k['focus_keyword'], true ),
			'noindex'       => (bool) $noindex,
			'writable'      => true,
		);
	}

	/** Write title / description / focus_keyword / noindex for one post, logged with an undo copy. */
	public static function save_fields( $post_id, $f, $summary, $change_id = null ) {
		$p = get_post( $post_id );
		if ( ! $p ) {
			return new WP_Error( 'wcc_seo', "No page with id {$post_id}.", array( 'status' => 404 ) );
		}
		$k = self::keys();
		if ( ! $k ) {
			return new WP_Error( 'wcc_seo', 'This site uses All in One SEO — change its titles in WordPress.', array( 'status' => 400 ) );
		}
		$set = array();
		foreach ( array( 'title', 'description', 'focus_keyword' ) as $name ) {
			if ( isset( $f[ $name ] ) && is_string( $f[ $name ] ) ) {
				$set[ $k[ $name ] ] = sanitize_text_field( $f[ $name ] );
			}
		}
		if ( isset( $f['noindex'] ) ) {
			$on = (bool) $f['noindex'];
			if ( 'rankmath' === self::plugin() ) {
				$r = get_post_meta( $post_id, $k['noindex'], true );
				$r = array_values( array_diff( is_array( $r ) ? $r : array(), array( 'noindex', 'index' ) ) );
				$r[] = $on ? 'noindex' : 'index';
				$set[ $k['noindex'] ] = $r;
			} elseif ( 'seopress' === self::plugin() ) {
				$set[ $k['noindex'] ] = $on ? 'yes' : '';
			} else {
				$set[ $k['noindex'] ] = $on ? '1' : '';
			}
		}
		if ( ! $set ) {
			return array( 'post_id' => $post_id, 'changed' => false );
		}
		$change_id = $change_id ? $change_id : WCC_Content::change_id();
		$summary   = $summary ? $summary : 'SEO for “' . get_the_title( $p ) . '”';
		WCC_Content::remember( $post_id, $change_id, $summary, array(), array_keys( $set ) );
		foreach ( $set as $mk => $v ) {
			if ( '' === $v ) {
				delete_post_meta( $post_id, $mk );
			} else {
				update_post_meta( $post_id, $mk, is_array( $v ) ? $v : wp_slash( $v ) );
			}
		}
		clean_post_cache( $post_id );
		WCC_Content::log_change( $change_id, $summary, array( 'post_id' => $post_id ) );
		return array( 'post_id' => $post_id, 'changed' => true, 'change_id' => $change_id );
	}

	/**
	 * Apply many fixes in one request: items [{id,title?,description?,focus_keyword?,noindex?,summary?}],
	 * media [{id,alt,summary?}]. Each is its own undoable change.
	 */
	public static function apply( $items, $media, $summary ) {
		$done = array();
		foreach ( array_slice( (array) $items, 0, 100 ) as $it ) {
			$id = (int) ( $it['id'] ?? 0 );
			if ( ! $id ) {
				continue;
			}
			$r      = self::save_fields( $id, (array) $it, (string) ( $it['summary'] ?? $summary ) );
			$done[] = is_wp_error( $r ) ? array( 'post_id' => $id, 'error' => $r->get_error_message() ) : $r;
		}
		foreach ( array_slice( (array) $media, 0, 200 ) as $m ) {
			$id = (int) ( $m['id'] ?? 0 );
			$a  = get_post( $id );
			if ( ! $a || 'attachment' !== $a->post_type || ! isset( $m['alt'] ) ) {
				$done[] = array( 'media_id' => $id, 'error' => 'No such image.' );
				continue;
			}
			$alt       = mb_substr( sanitize_text_field( (string) $m['alt'] ), 0, 250 );
			$change_id = WCC_Content::change_id();
			$sum       = (string) ( $m['summary'] ?? '' );
			$sum       = $sum ? $sum : 'Alt text for ' . basename( (string) get_attached_file( $id ) ) . ': “' . $alt . '”';
			WCC_Content::remember( $id, $change_id, $sum, array(), array( '_wp_attachment_image_alt' ) );
			update_post_meta( $id, '_wp_attachment_image_alt', wp_slash( $alt ) );
			WCC_Content::log_change( $change_id, $sum, array( 'media_id' => $id ) );
			$done[] = array( 'media_id' => $id, 'changed' => true, 'change_id' => $change_id );
		}
		if ( $done ) {
			WCC_Maintenance::purge_caches();
		}
		return array( 'results' => $done );
	}

	/* ------------------------------------------------------------------ */
	/* Which pages count                                                    */
	/* ------------------------------------------------------------------ */

	/** Public post types with how many published items each has, and whether search engines are told to skip them. */
	public static function post_types() {
		$s   = self::settings();
		$out = array();
		foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $t ) {
			if ( 'attachment' === $t->name ) {
				continue;
			}
			$c     = wp_count_posts( $t->name );
			$out[] = array(
				'name'      => $t->name,
				'label'     => $t->labels->name,
				'published' => (int) ( $c->publish ?? 0 ),
				'hidden'    => self::type_hidden( $t->name, $s ),
				'builder'   => (bool) preg_match( self::BUILDER_TYPES, $t->name ),
			);
		}
		return $out;
	}

	private static function type_hidden( $type, $s = null ) {
		$s = $s ? $s : self::settings();
		if ( in_array( $type, (array) $s['noindex_types'], true ) ) {
			return true;
		}
		if ( 'yoast' === self::plugin() && class_exists( 'WPSEO_Options' ) ) {
			return (bool) WPSEO_Options::get( 'noindex-' . $type, false );
		}
		if ( 'rankmath' === self::plugin() ) {
			$t = get_option( 'rank-math-options-titles', array() );
			$r = $t[ "pt_{$type}_robots" ] ?? array();
			return ! empty( $t[ "pt_{$type}_custom_robots" ] ) && is_array( $r ) && in_array( 'noindex', $r, true );
		}
		return false;
	}

	private static function indexable_types() {
		$types = array();
		foreach ( self::post_types() as $t ) {
			if ( ! $t['hidden'] && ! $t['builder'] ) {
				$types[] = $t['name'];
			}
		}
		return $types ? $types : array( 'page' );
	}

	/* ------------------------------------------------------------------ */
	/* Audit                                                                */
	/* ------------------------------------------------------------------ */

	private static function fetch( $url, $timeout = 15, $html_page = true ) {
		$res = wp_remote_get(
			add_query_arg( 'wcc_audit', time(), $url ),
			array( 'timeout' => $timeout, 'redirection' => 3, 'sslverify' => false, 'user-agent' => 'Mozilla/5.0 (compatible; WebCulture-SEO-Audit/1.5; +https://webculture.au)', 'headers' => array( 'Cache-Control' => 'no-cache' ) )
		);
		if ( is_wp_error( $res ) ) {
			return array( 'ok' => false, 'code' => 0, 'error' => $res->get_error_message(), 'html' => '' );
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$html = (string) wp_remote_retrieve_body( $res );
		$bot  = (bool) preg_match( '/<title>\s*One moment, please/i', $html );
		$ok   = $code >= 200 && $code < 300 && ! $bot && ( $html_page ? false !== stripos( $html, '<html' ) : false === stripos( $html, '<html' ) );
		return array( 'ok' => $ok, 'code' => $code, 'error' => $ok ? null : ( $code ? "HTTP {$code}" . ( $bot ? ' (the host\'s bot check answered instead of the page)' : '' ) : 'no answer' ), 'html' => $html );
	}

	private static function text_of( $node ) {
		return trim( preg_replace( '/\s+/u', ' ', html_entity_decode( (string) $node->textContent, ENT_QUOTES, 'UTF-8' ) ) );
	}

	/** Everything search engines and AI tools read from one rendered page. */
	public static function analyse_html( $html, $url ) {
		$out = array(
			'title'       => '',
			'description' => '',
			'robots'      => '',
			'canonical'   => '',
			'og_image'    => false,
			'h1'          => array(),
			'h2'          => 0,
			'words'       => 0,
			'images'      => array(),
			'schema'      => array(),
			'links_in'    => 0,
			'lang'        => '',
			'viewport'    => false,
			'text'        => '',
			'headings'    => array(),
		);
		if ( '' === $html || ! class_exists( 'DOMDocument' ) ) {
			return $out;
		}
		$prev = libxml_use_internal_errors( true );
		$doc  = new DOMDocument();
		$doc->loadHTML( '<?xml encoding="UTF-8">' . $html, LIBXML_NOWARNING | LIBXML_NOERROR );
		libxml_clear_errors();
		libxml_use_internal_errors( $prev );
		$xp = new DOMXPath( $doc );

		$t = $xp->query( '//head/title' );
		if ( $t && $t->length ) {
			$out['title'] = self::text_of( $t->item( 0 ) );
		}
		foreach ( $xp->query( '//meta' ) as $m ) {
			$name = strtolower( $m->getAttribute( 'name' ) . $m->getAttribute( 'property' ) );
			$c    = trim( $m->getAttribute( 'content' ) );
			if ( 'description' === $name ) {
				$out['description'] = html_entity_decode( $c, ENT_QUOTES, 'UTF-8' );
			} elseif ( 'robots' === $name ) {
				$out['robots'] = $c;
			} elseif ( 'og:image' === $name && $c ) {
				$out['og_image'] = true;
			} elseif ( 'viewport' === $name ) {
				$out['viewport'] = true;
			}
		}
		foreach ( $xp->query( '//link[@rel="canonical"]' ) as $l ) {
			$out['canonical'] = $l->getAttribute( 'href' );
		}
		$h = $xp->query( '//html' );
		if ( $h && $h->length ) {
			$out['lang'] = $h->item( 0 )->getAttribute( 'lang' );
		}
		foreach ( $xp->query( '//script[@type="application/ld+json"]' ) as $s ) {
			$j = json_decode( trim( $s->textContent ), true );
			if ( ! is_array( $j ) ) {
				$out['schema'][] = 'invalid';
				continue;
			}
			$nodes = isset( $j['@graph'] ) ? (array) $j['@graph'] : ( isset( $j[0] ) ? $j : array( $j ) );
			foreach ( $nodes as $n ) {
				if ( is_array( $n ) && isset( $n['@type'] ) ) {
					foreach ( (array) $n['@type'] as $ty ) {
						$out['schema'][] = (string) $ty;
					}
				}
			}
		}
		$out['schema'] = array_values( array_unique( $out['schema'] ) );

		// Headings anywhere in the body (themes put the page title in a header band)
		foreach ( $xp->query( '//body//h1' ) as $n ) {
			$out['h1'][] = mb_substr( self::text_of( $n ), 0, 160 );
		}
		$out['h2'] = $xp->query( '//body//h2' )->length;
		$first     = $xp->query( '//body//h2' );
		if ( ! $out['h1'] && $first && $first->length ) {
			$h2                  = $first->item( 0 );
			$out['h2_first']     = mb_substr( self::text_of( $h2 ), 0, 160 );
			$out['h2_first_cls'] = trim( (string) $h2->getAttribute( 'class' ) );
		}
		foreach ( $xp->query( '//body//h1 | //body//h2 | //body//h3' ) as $n ) {
			if ( count( $out['headings'] ) >= 40 ) {
				break;
			}
			$tx = mb_substr( self::text_of( $n ), 0, 160 );
			if ( '' !== $tx ) {
				$out['headings'][] = strtolower( $n->nodeName ) . ': ' . $tx;
			}
		}

		// Main text: the body minus scripts, styles, headers, footers, navigation and forms
		$body = $xp->query( '//body' );
		if ( $body && $body->length ) {
			$clone = $body->item( 0 )->cloneNode( true );
			$cdoc  = new DOMDocument();
			$cdoc->appendChild( $cdoc->importNode( $clone, true ) );
			$cxp = new DOMXPath( $cdoc );
			foreach ( $cxp->query( '//script|//style|//noscript|//header|//footer|//nav|//form|//svg|//*[contains(@class,"elementor-location-header")]|//*[contains(@class,"elementor-location-footer")]|//*[contains(@class,"site-header")]|//*[contains(@class,"site-footer")]|//*[contains(@class,"nav_menu_bar-popup")]' ) as $rm ) {
				if ( $rm->parentNode ) {
					$rm->parentNode->removeChild( $rm );
				}
			}
			$text        = trim( preg_replace( '/\s+/u', ' ', html_entity_decode( (string) $cdoc->textContent, ENT_QUOTES, 'UTF-8' ) ) );
			$out['words'] = $text ? count( preg_split( '/\s+/u', $text ) ) : 0;
			$out['text']  = mb_substr( $text, 0, 8000 );
		}

		$host  = wp_parse_url( home_url(), PHP_URL_HOST );
		$seen  = array();
		foreach ( $xp->query( '//body//img' ) as $img ) {
			$src = $img->getAttribute( 'src' );
			if ( ! $src || 0 === strpos( $src, 'data:' ) ) {
				$src = $img->getAttribute( 'data-src' ) ? $img->getAttribute( 'data-src' ) : $img->getAttribute( 'data-lazy-src' );
			}
			if ( ! $src || 0 === strpos( $src, 'data:' ) || isset( $seen[ $src ] ) ) {
				continue;
			}
			$seen[ $src ] = true;
			$in_chrome    = false;
			for ( $p = $img->parentNode; $p && $p instanceof DOMElement; $p = $p->parentNode ) {
				$cls = ' ' . $p->getAttribute( 'class' ) . ' ';
				if ( in_array( strtolower( $p->nodeName ), array( 'header', 'footer', 'nav' ), true ) || preg_match( '/elementor-location-(header|footer)|site-(header|footer)|nav_menu_bar-popup/', $cls ) ) {
					$in_chrome = true;
					break;
				}
			}
			if ( count( $out['images'] ) < 60 ) {
				$out['images'][] = array(
					'src'    => $src,
					'alt'    => $img->hasAttribute( 'alt' ) ? trim( $img->getAttribute( 'alt' ) ) : null,
					'chrome' => $in_chrome,
				);
			}
		}
		foreach ( $xp->query( '//body//a[@href]' ) as $a ) {
			$hr = $a->getAttribute( 'href' );
			$hh = wp_parse_url( $hr, PHP_URL_HOST );
			if ( ( ! $hh && 0 === strpos( $hr, '/' ) ) || $hh === $host ) {
				++$out['links_in'];
			}
		}
		return $out;
	}

	/** Attachment id + its library alt text for each image the page shows. */
	private static function attach_ids( &$images ) {
		foreach ( $images as &$im ) {
			$src = preg_replace( '/-\d+x\d+(?=\.[a-z]{3,4}$)/i', '', strtok( $im['src'], '?' ) );
			$src = preg_replace( '/-scaled(?=\.[a-z]{3,4}$)/i', '', $src );
			$id  = (int) attachment_url_to_postid( $src );
			if ( ! $id ) {
				$id = (int) attachment_url_to_postid( strtok( $im['src'], '?' ) );
			}
			if ( ! $id ) {
				$scaled = preg_replace( '/(\.[a-z]{3,4})$/i', '-scaled$1', $src );
				$id     = (int) attachment_url_to_postid( $scaled );
			}
			$im['id']      = $id ? $id : null;
			$im['lib_alt'] = $id ? (string) get_post_meta( $id, '_wp_attachment_image_alt', true ) : null;
		}
	}

	/**
	 * Audit a slice of the site's public pages. Call with offset 0, then next_offset until it comes back null.
	 * Slices stop early once $budget seconds are used, so shared hosting doesn't time out.
	 */
	public static function audit( $offset = 0, $limit = 10, $budget = 25 ) {
		$start = microtime( true );
		$types = self::indexable_types();
		$q     = new WP_Query(
			array(
				'post_type'      => $types,
				'post_status'    => 'publish',
				'posts_per_page' => max( 1, min( 25, (int) $limit ) ),
				'offset'         => max( 0, (int) $offset ),
				'orderby'        => array( 'post_type' => 'ASC', 'menu_order' => 'ASC', 'ID' => 'ASC' ),
				'no_found_rows'  => false,
				'fields'         => 'ids',
			)
		);
		$items = array();
		$front = (int) get_option( 'page_on_front' );
		foreach ( $q->posts as $i => $id ) {
			if ( microtime( true ) - $start > max( 5, (int) $budget ) ) {
				break;
			}
			$url  = get_permalink( $id );
			$f    = self::fetch( $url );
			$a    = $f['ok'] ? self::analyse_html( $f['html'], $url ) : null;
			if ( $a ) {
				self::attach_ids( $a['images'] );
				unset( $a['text'] );
			}
			$items[] = array(
				'id'        => (int) $id,
				'type'      => get_post_type( $id ),
				'url'       => $url,
				'name'      => html_entity_decode( get_the_title( $id ), ENT_QUOTES ),
				'front'     => $id === $front,
				'modified'  => get_post_modified_time( 'c', true, $id ),
				'fields'    => self::fields( $id ),
				'fetched'   => $f['ok'],
				'http'      => $f['code'],
				'error'     => $f['error'],
				'page'      => $a,
			);
		}
		$done = $offset + count( $items );
		return array(
			'total'       => (int) $q->found_posts,
			'offset'      => (int) $offset,
			'next_offset' => $done < (int) $q->found_posts ? $done : null,
			'items'       => $items,
			'site'        => 0 === (int) $offset ? self::site_checks() : null,
		);
	}

	/** One page in depth for the AI: its text, headings and images (with library ids). */
	public static function page( $id ) {
		$p = get_post( (int) $id );
		if ( ! $p || 'publish' !== $p->post_status ) {
			return new WP_Error( 'wcc_seo', 'No published page with that id.', array( 'status' => 404 ) );
		}
		$url = get_permalink( $p );
		$f   = self::fetch( $url );
		$a   = $f['ok'] ? self::analyse_html( $f['html'], $url ) : null;
		if ( $a ) {
			self::attach_ids( $a['images'] );
		} else {
			$a = array( 'text' => mb_substr( trim( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( do_shortcode( $p->post_content ) ) ) ), 0, 8000 ), 'images' => array(), 'headings' => array() );
		}
		return array(
			'id'      => (int) $p->ID,
			'type'    => $p->post_type,
			'url'     => $url,
			'name'    => html_entity_decode( get_the_title( $p ), ENT_QUOTES ),
			'fields'  => self::fields( $p->ID ),
			'fetched' => $f['ok'],
			'page'    => $a,
		);
	}

	/* ------------------------------------------------------------------ */
	/* Site-wide checks                                                     */
	/* ------------------------------------------------------------------ */

	private static function sitemap_url() {
		$plugin = self::plugin();
		if ( 'yoast' === $plugin && class_exists( 'WPSEO_Options' ) && WPSEO_Options::get( 'enable_xml_sitemap', true ) ) {
			return home_url( '/sitemap_index.xml' );
		}
		if ( 'rankmath' === $plugin ) {
			return home_url( '/sitemap_index.xml' );
		}
		if ( 'seopress' === $plugin ) {
			return home_url( '/sitemaps.xml' );
		}
		return function_exists( 'get_sitemap_url' ) ? get_sitemap_url( 'index' ) : home_url( '/wp-sitemap.xml' );
	}

	public static function site_checks() {
		$s        = self::settings();
		$plugin   = self::plugin();
		$robots   = self::fetch( home_url( '/robots.txt' ), 10, false );
		$llmsf    = self::fetch( home_url( '/llms.txt' ), 10, false );
		$sitemap  = self::fetch( self::sitemap_url(), 15, false );
		$blocked  = array();
		$rtxt     = (string) $robots['html'];
		if ( $robots['ok'] ) {
			$blocks = preg_split( '/\n(?=\s*user-agent\s*:)/i', str_replace( "\r", '', $rtxt ) );
			foreach ( $blocks as $b ) {
				if ( preg_match_all( '/^\s*user-agent\s*:\s*(.+)$/im', $b, $ua ) && preg_match( '/^\s*disallow\s*:\s*\/\s*$/im', $b ) ) {
					foreach ( $ua[1] as $u ) {
						$u = trim( $u );
						if ( '*' === $u ) {
							$blocked[] = 'all crawlers';
						} else {
							foreach ( self::AI_BOTS as $bot ) {
								if ( 0 === strcasecmp( $u, $bot ) ) {
									$blocked[] = $bot;
								}
							}
						}
					}
				}
			}
		}
		$llms_source = 'none';
		if ( file_exists( ABSPATH . 'llms.txt' ) ) {
			$llms_source = false !== strpos( (string) @file_get_contents( ABSPATH . 'llms.txt', false, null, 0, 600 ), 'Yoast' ) ? 'yoast' : 'file'; // phpcs:ignore
		} elseif ( $s['llms'] ) {
			$llms_source = 'connector';
		}
		$verify = array(
			'google' => (bool) $s['verify_google'] || ( 'yoast' === $plugin && class_exists( 'WPSEO_Options' ) && WPSEO_Options::get( 'googleverify', '' ) ),
			'bing'   => (bool) $s['verify_bing'] || ( 'yoast' === $plugin && class_exists( 'WPSEO_Options' ) && WPSEO_Options::get( 'msverify', '' ) ),
		);
		$home = self::fetch( home_url( '/' ), 15 );
		$ha   = $home['ok'] ? self::analyse_html( $home['html'], home_url( '/' ) ) : null;
		return array(
			'name'            => get_bloginfo( 'name' ),
			'tagline'         => get_bloginfo( 'description' ),
			'home'            => home_url( '/' ),
			'https'           => 0 === strpos( home_url(), 'https://' ),
			'search_visible'  => '1' === (string) get_option( 'blog_public' ),
			'permalinks'      => (bool) get_option( 'permalink_structure' ),
			'seo_plugin'      => $plugin ? $plugin : 'none',
			'sitemap'         => array( 'url' => self::sitemap_url(), 'ok' => $sitemap['ok'] && false !== stripos( $sitemap['html'], '<loc>' ), 'http' => $sitemap['code'], 'error' => $sitemap['ok'] ? null : $sitemap['error'] ),
			'robots'          => array( 'ok' => $robots['ok'], 'file' => file_exists( ABSPATH . 'robots.txt' ), 'blocked' => array_values( array_unique( $blocked ) ), 'text' => $robots['ok'] ? mb_substr( $rtxt, 0, 3000 ) : '' ),
			'llms'            => array( 'source' => $llms_source, 'ok' => $llmsf['ok'], 'text' => $llmsf['ok'] ? mb_substr( (string) $llmsf['html'], 0, 1500 ) : '' ),
			'verify'          => $verify,
			'schema_types'    => $ha ? $ha['schema'] : array(),
			'home_fetched'    => $home['ok'],
			'home_error'      => $home['error'],
			'home_lang'       => $ha ? $ha['lang'] : '',
			'home_viewport'   => $ha ? $ha['viewport'] : null,
			'post_types'      => self::post_types(),
			'settings'        => $s,
			'connector'       => WCC_VERSION,
		);
	}

	/* ------------------------------------------------------------------ */
	/* Front end output                                                     */
	/* ------------------------------------------------------------------ */

	public static function init() {
		if ( is_admin() ) {
			return;
		}
		add_action( 'init', array( __CLASS__, 'serve_llms' ), 1 );
		add_filter( 'robots_txt', array( __CLASS__, 'robots_txt' ), 99, 2 );
		add_action( 'wp_head', array( __CLASS__, 'head' ), 2 );
		add_filter( 'the_content', array( __CLASS__, 'collect_faq' ), 999 );
		add_action( 'wp_footer', array( __CLASS__, 'footer' ), 50 );

		// Hidden post types: out of search results and sitemaps, whichever SEO plugin makes them
		add_filter( 'wp_robots', array( __CLASS__, 'wp_robots' ), 99 );
		add_filter( 'wpseo_robots', array( __CLASS__, 'plugin_robots' ), 99 );
		add_filter( 'rank_math/frontend/robots', array( __CLASS__, 'rankmath_robots' ), 99 );
		add_filter( 'wpseo_sitemap_exclude_post_type', array( __CLASS__, 'exclude_type' ), 99, 2 );
		add_filter( 'rank_math/sitemap/exclude_post_type', array( __CLASS__, 'exclude_type' ), 99, 2 );
		add_filter( 'wp_sitemaps_post_types', array( __CLASS__, 'core_sitemap_types' ), 99 );

		// Server-side fixes on the finished page: the theme's page title as the H1, library alt text on images
		add_action( 'template_redirect', array( __CLASS__, 'start_buffer' ), 0 );

		// No SEO plugin: the connector writes the title and description itself
		if ( ! self::plugin() ) {
			add_filter( 'pre_get_document_title', array( __CLASS__, 'own_title' ), 20 );
		}
	}

	private static function hidden_now() {
		if ( ! is_singular() ) {
			return false;
		}
		$s = self::settings();
		if ( in_array( get_post_type(), (array) $s['noindex_types'], true ) ) {
			return true;
		}
		return ! self::plugin() && '1' === (string) get_post_meta( get_queried_object_id(), '_wcc_noindex', true );
	}

	public static function wp_robots( $robots ) {
		if ( self::hidden_now() ) {
			$robots['noindex'] = true;
			$robots['follow']  = true;
			unset( $robots['index'], $robots['max-snippet'], $robots['max-image-preview'], $robots['max-video-preview'] );
		}
		return $robots;
	}

	public static function plugin_robots( $robots ) {
		if ( self::hidden_now() ) {
			return is_string( $robots ) ? preg_replace( '/\bindex\b/', 'noindex', $robots ) : $robots;
		}
		return $robots;
	}

	public static function rankmath_robots( $robots ) {
		if ( self::hidden_now() && is_array( $robots ) ) {
			unset( $robots['index'] );
			$robots['noindex'] = 'noindex';
		}
		return $robots;
	}

	public static function exclude_type( $excluded, $type ) {
		return in_array( $type, (array) self::settings()['noindex_types'], true ) ? true : $excluded;
	}

	public static function core_sitemap_types( $types ) {
		foreach ( (array) self::settings()['noindex_types'] as $t ) {
			unset( $types[ $t ] );
		}
		return $types;
	}

	public static function own_title( $title ) {
		if ( is_singular() ) {
			$t = (string) get_post_meta( get_queried_object_id(), '_wcc_seo_title', true );
			if ( '' !== $t ) {
				return $t;
			}
		}
		return $title;
	}

	public static function head() {
		$s = self::settings();
		// Verification: only when the SEO plugin isn't already printing the same code
		$yg = ( 'yoast' === self::plugin() && class_exists( 'WPSEO_Options' ) ) ? (string) WPSEO_Options::get( 'googleverify', '' ) : '';
		$yb = ( 'yoast' === self::plugin() && class_exists( 'WPSEO_Options' ) ) ? (string) WPSEO_Options::get( 'msverify', '' ) : '';
		if ( $s['verify_google'] && $s['verify_google'] !== $yg ) {
			echo '<meta name="google-site-verification" content="' . esc_attr( $s['verify_google'] ) . '" />' . "\n";
		}
		if ( $s['verify_bing'] && $s['verify_bing'] !== $yb ) {
			echo '<meta name="msvalidate.01" content="' . esc_attr( $s['verify_bing'] ) . '" />' . "\n";
		}

		if ( ! self::plugin() && is_singular() ) {
			$id   = get_queried_object_id();
			$desc = (string) get_post_meta( $id, '_wcc_seo_desc', true );
			if ( '' === $desc ) {
				$desc = wp_trim_words( wp_strip_all_tags( get_the_excerpt( $id ) ), 30, '…' );
			}
			if ( $desc ) {
				echo '<meta name="description" content="' . esc_attr( $desc ) . '" />' . "\n";
			}
			$title = (string) get_post_meta( $id, '_wcc_seo_title', true );
			$title = $title ? $title : wp_get_document_title();
			echo '<meta property="og:type" content="' . ( is_front_page() ? 'website' : 'article' ) . '" />' . "\n";
			echo '<meta property="og:title" content="' . esc_attr( $title ) . '" />' . "\n";
			if ( $desc ) {
				echo '<meta property="og:description" content="' . esc_attr( $desc ) . '" />' . "\n";
			}
			echo '<meta property="og:url" content="' . esc_url( get_permalink( $id ) ) . '" />' . "\n";
			echo '<meta property="og:site_name" content="' . esc_attr( get_bloginfo( 'name' ) ) . '" />' . "\n";
			$img = get_the_post_thumbnail_url( $id, 'large' );
			$img = $img ? $img : $s['business']['image'];
			if ( $img ) {
				echo '<meta property="og:image" content="' . esc_url( $img ) . '" />' . "\n";
			}
			echo '<meta name="twitter:card" content="summary_large_image" />' . "\n";
		}

		if ( $s['schema'] && '' !== trim( $s['business']['name'] ) ) {
			$json = self::business_schema( $s['business'] );
			echo '<script type="application/ld+json" class="wcc-business-schema">' . wp_json_encode( $json, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>' . "\n";
		}
	}

	public static function start_buffer() {
		$s = self::settings();
		if ( ( ! $s['h1_class'] && ! $s['alt_fill'] ) || is_feed() || is_robots() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || is_customize_preview() || isset( $_GET['elementor-preview'] ) ) { // phpcs:ignore
			return;
		}
		ob_start( array( __CLASS__, 'filter_html' ) );
	}

	/** Runs on the finished HTML. Never throws: anything unexpected returns the page untouched. */
	public static function filter_html( $html ) {
		try {
			if ( ! is_string( $html ) || strlen( $html ) < 200 || false === stripos( $html, '</html>' ) ) {
				return $html;
			}
			$s = self::settings();
			// 1. No <h1> on the page: the theme's page-title heading (an <h2> with the chosen class) becomes the <h1>
			if ( $s['h1_class'] && ! preg_match( '/<h1[\s>]/i', $html ) ) {
				$cls  = preg_quote( $s['h1_class'], '/' );
				$html = preg_replace( '/<h2(\s[^>]*class=["\'][^"\']*\b' . $cls . '\b[^"\']*["\'][^>]*)>(.*?)<\/h2>/is', '<h1$1>$2</h1>', $html, 1 );
			}
			// 2. Images whose alt is missing, empty or just "image": use the alt text saved in the media library
			if ( $s['alt_fill'] ) {
				$cache = array();
				$html  = preg_replace_callback(
					'/<img\b[^>]*>/i',
					function ( $m ) use ( &$cache ) {
						$tag = $m[0];
						if ( preg_match( '/\balt=(["\'])(.*?)\1/i', $tag, $a ) && '' !== trim( $a[2] ) && ! preg_match( '/^(image|img|photo|picture)$/i', trim( $a[2] ) ) ) {
							return $tag;
						}
						if ( ! preg_match( '/\b(?:data-src|src)=(["\'])(.*?)\1/i', $tag, $src ) || 0 === strpos( $src[2], 'data:' ) ) {
							return $tag;
						}
						$url = strtok( $src[2], '?' );
						if ( ! isset( $cache[ $url ] ) ) {
							$base = preg_replace( '/-(\d+x\d+|scaled)(?=\.[a-z]{3,4}$)/i', '', $url );
							$id   = (int) attachment_url_to_postid( $base );
							if ( ! $id ) {
								$id = (int) attachment_url_to_postid( $url );
							}
							$cache[ $url ] = $id ? trim( (string) get_post_meta( $id, '_wp_attachment_image_alt', true ) ) : '';
						}
						$alt = $cache[ $url ];
						if ( '' === $alt ) {
							return $tag;
						}
						$alt = esc_attr( $alt );
						return preg_match( '/\balt=(["\']).*?\1/i', $tag ) ? preg_replace( '/\balt=(["\']).*?\1/i', 'alt="' . $alt . '"', $tag, 1 ) : preg_replace( '/^<img\b/i', '<img alt="' . $alt . '"', $tag, 1 );
					},
					$html
				);
			}
			return $html;
		} catch ( Throwable $e ) {
			return $html;
		}
	}

	public static function business_schema( $b ) {
		$home = home_url( '/' );
		$j    = array(
			'@context' => 'https://schema.org',
			'@type'    => $b['type'] ? $b['type'] : 'LocalBusiness',
			'@id'      => $home . '#business',
			'name'     => $b['name'],
			'url'      => $home,
		);
		foreach ( array( 'description' => 'description', 'phone' => 'telephone', 'email' => 'email', 'logo' => 'logo', 'image' => 'image', 'founded' => 'foundingDate', 'price_range' => 'priceRange' ) as $k => $prop ) {
			if ( ! empty( $b[ $k ] ) ) {
				$j[ $prop ] = $b[ $k ];
			}
		}
		$addr = array_filter(
			array(
				'streetAddress'   => $b['street'],
				'addressLocality' => $b['locality'],
				'addressRegion'   => $b['region'],
				'postalCode'      => $b['postcode'],
				'addressCountry'  => $b['country'],
			)
		);
		if ( count( $addr ) > 1 ) {
			$j['address'] = array( '@type' => 'PostalAddress' ) + $addr;
		}
		if ( $b['area'] ) {
			$j['areaServed'] = array_map( fn( $a ) => array( '@type' => 'Place', 'name' => is_array( $a ) ? $a['name'] : $a ), $b['area'] );
		}
		if ( $b['services'] ) {
			$j['hasOfferCatalog'] = array(
				'@type'           => 'OfferCatalog',
				'name'            => 'Services',
				'itemListElement' => array_map(
					function ( $sv ) {
						$sv = is_array( $sv ) ? $sv : array( 'name' => $sv );
						$s  = array( '@type' => 'Service', 'name' => $sv['name'] );
						if ( ! empty( $sv['url'] ) ) {
							$s['url'] = $sv['url'];
						}
						if ( ! empty( $sv['description'] ) ) {
							$s['description'] = $sv['description'];
						}
						return array( '@type' => 'Offer', 'itemOffered' => $s );
					},
					$b['services']
				),
			);
			$j['knowsAbout'] = array_values( array_map( fn( $sv ) => is_array( $sv ) ? $sv['name'] : $sv, $b['services'] ) );
		}
		if ( $b['same_as'] ) {
			$j['sameAs'] = array_values( $b['same_as'] );
		}
		return $j;
	}

	/** Pick up <details><summary>question</summary>answer</details> FAQs from the page as it renders. */
	public static function collect_faq( $content ) {
		if ( ! is_singular() ) {
			return $content;
		}
		$s = self::settings();
		if ( ! $s['faq_schema'] || false !== stripos( $content, 'FAQPage' ) || false !== strpos( $content, 'schema-faq' ) ) {
			return $content;
		}
		if ( preg_match_all( '#<details[^>]*>\s*<summary[^>]*>(.*?)</summary>(.*?)</details>#is', $content, $m, PREG_SET_ORDER ) ) {
			foreach ( $m as $x ) {
				$q = trim( wp_strip_all_tags( html_entity_decode( $x[1], ENT_QUOTES ) ) );
				$a = trim( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( html_entity_decode( $x[2], ENT_QUOTES ) ) ) );
				if ( $q && $a && count( self::$faq ) < 30 ) {
					self::$faq[ md5( $q ) ] = array( $q, $a );
				}
			}
		}
		return $content;
	}

	public static function footer() {
		if ( ! self::$faq ) {
			return;
		}
		$json = array(
			'@context'   => 'https://schema.org',
			'@type'      => 'FAQPage',
			'mainEntity' => array_values(
				array_map(
					fn( $x ) => array( '@type' => 'Question', 'name' => $x[0], 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => $x[1] ) ),
					self::$faq
				)
			),
		);
		echo '<script type="application/ld+json" class="wcc-faq-schema">' . wp_json_encode( $json, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>' . "\n";
	}

	public static function robots_txt( $output, $public ) {
		$s = self::settings();
		if ( ! $public || 'default' === $s['ai_crawlers'] ) {
			return $output;
		}
		$rule   = 'allow' === $s['ai_crawlers'] ? 'Allow: /' : 'Disallow: /';
		$lines  = "\n# AI search and assistants (Web Culture Connector)\n";
		foreach ( self::AI_BOTS as $bot ) {
			$lines .= "User-agent: {$bot}\n{$rule}\n\n";
		}
		if ( false === stripos( $output, 'sitemap:' ) && ! in_array( self::plugin(), array( 'yoast', 'rankmath', 'seopress' ), true ) ) {
			$lines .= 'Sitemap: ' . self::sitemap_url() . "\n";
		}
		return rtrim( $output ) . "\n" . $lines;
	}

	/** /llms.txt, when no llms.txt file sits on the server (a real file is always served first by the web server). */
	public static function serve_llms() {
		$path = wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH ); // phpcs:ignore
		$base = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
		if ( rtrim( $base, '/' ) . '/llms.txt' !== $path ) {
			return;
		}
		$s = self::settings();
		if ( ! $s['llms'] ) {
			return;
		}
		nocache_headers();
		header( 'Content-Type: text/plain; charset=utf-8' );
		header( 'X-Robots-Tag: noindex' );
		echo self::llms_text(); // phpcs:ignore
		exit;
	}

	private static function md( $t ) {
		return trim( preg_replace( '/[\r\n]+/', ' ', str_replace( array( '[', ']' ), array( '(', ')' ), (string) $t ) ) );
	}

	public static function llms_text() {
		$s     = self::settings();
		$b     = $s['business'];
		$name  = $b['name'] ? $b['name'] : get_bloginfo( 'name' );
		$intro = $s['llms_intro'] ? $s['llms_intro'] : ( $b['description'] ? $b['description'] : get_bloginfo( 'description' ) );
		$out   = '# ' . self::md( $name ) . "\n\n";
		if ( $intro ) {
			$out .= '> ' . self::md( $intro ) . "\n\n";
		}
		$facts = array();
		if ( $b['phone'] ) {
			$facts[] = 'Phone: ' . $b['phone'];
		}
		if ( $b['email'] ) {
			$facts[] = 'Email: ' . $b['email'];
		}
		$place = implode( ', ', array_filter( array( $b['locality'], $b['region'], $b['country'] ) ) );
		if ( $place ) {
			$facts[] = 'Based in: ' . $place;
		}
		if ( $b['area'] ) {
			$facts[] = 'Areas served: ' . implode( ', ', array_map( fn( $a ) => is_array( $a ) ? $a['name'] : $a, $b['area'] ) );
		}
		if ( $b['founded'] ) {
			$facts[] = 'Established: ' . $b['founded'];
		}
		if ( $facts ) {
			$out .= implode( "\n", array_map( fn( $f ) => '- ' . self::md( $f ), $facts ) ) . "\n\n";
		}

		$ids = $s['llms_pages'];
		if ( ! $ids ) {
			$ids = get_posts( array( 'post_type' => self::indexable_types(), 'post_status' => 'publish', 'numberposts' => 60, 'fields' => 'ids', 'orderby' => array( 'menu_order' => 'ASC', 'date' => 'DESC' ) ) );
		}
		$groups = array();
		foreach ( $ids as $id ) {
			$p = get_post( $id );
			if ( ! $p || 'publish' !== $p->post_status ) {
				continue;
			}
			$f    = self::fields( $id );
			if ( $f['noindex'] ) {
				continue;
			}
			$type = get_post_type_object( $p->post_type );
			$g    = $type ? $type->labels->name : 'Pages';
			$line = '- [' . self::md( get_the_title( $p ) ) . '](' . get_permalink( $p ) . ')';
			if ( $f['description'] ) {
				$line .= ': ' . self::md( wp_strip_all_tags( $f['description'] ) );
			}
			$groups[ $g ][] = $line;
		}
		foreach ( $groups as $g => $lines ) {
			$out .= '## ' . self::md( $g ) . "\n" . implode( "\n", $lines ) . "\n\n";
		}
		$out .= "## Optional\n- [Sitemap](" . self::sitemap_url() . ")\n";
		return $out;
	}
}
