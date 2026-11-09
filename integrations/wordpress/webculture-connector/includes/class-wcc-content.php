<?php
/**
 * Content tools for the command centre's AI maintenance: read and change pages, posts, Elementor layouts, SEO titles
 * and descriptions, images, menus and basic site settings.
 *
 * Every change keeps an undo copy of what it replaced (per post, the last few changes) and is written to the
 * maintenance log, so each AI job leaves a trail and can be reversed one change at a time.
 *
 * @package WebCultureConnector
 */

defined( 'ABSPATH' ) || exit;

class WCC_Content {

	const UNDO_META = '_wcc_undo';
	const UNDO_KEEP = 8;
	const UNDO_OPT  = 'wcc_undo_options';

	/* ------------------------------------------------------------------ */
	/* Helpers                                                              */
	/* ------------------------------------------------------------------ */

	private static function err( $msg, $status = 400, $code = 'wcc_content' ) {
		return new WP_Error( $code, $msg, array( 'status' => $status ) );
	}

	private static function change_id() {
		return 'c' . time() . strtolower( wp_generate_password( 6, false, false ) );
	}

	public static function builder( $post_id ) {
		if ( 'builder' === get_post_meta( $post_id, '_elementor_edit_mode', true ) && get_post_meta( $post_id, '_elementor_data', true ) ) {
			return 'elementor';
		}
		$c = (string) get_post_field( 'post_content', $post_id );
		if ( false !== strpos( $c, '<!-- wp:' ) ) {
			return 'blocks';
		}
		if ( false !== strpos( $c, '[vc_row' ) ) {
			return 'wpbakery';
		}
		if ( false !== strpos( $c, '[et_pb_' ) ) {
			return 'divi';
		}
		return 'classic';
	}

	public static function seo_plugin() {
		if ( defined( 'WPSEO_VERSION' ) ) {
			return 'yoast';
		}
		if ( defined( 'RANK_MATH_VERSION' ) ) {
			return 'rankmath';
		}
		if ( defined( 'SEOPRESS_VERSION' ) ) {
			return 'seopress';
		}
		if ( defined( 'AIOSEO_VERSION' ) ) {
			return 'aioseo';
		}
		return null;
	}

	private static function seo_keys() {
		switch ( self::seo_plugin() ) {
			case 'yoast':
				return array( 'title' => '_yoast_wpseo_title', 'description' => '_yoast_wpseo_metadesc', 'focus_keyword' => '_yoast_wpseo_focuskw' );
			case 'rankmath':
				return array( 'title' => 'rank_math_title', 'description' => 'rank_math_description', 'focus_keyword' => 'rank_math_focus_keyword' );
			case 'seopress':
				return array( 'title' => '_seopress_titles_title', 'description' => '_seopress_titles_desc', 'focus_keyword' => '_seopress_analysis_target_kw' );
		}
		return array();
	}

	private static function seo_get( $post_id ) {
		$out = array( 'plugin' => self::seo_plugin() );
		foreach ( self::seo_keys() as $k => $meta ) {
			$out[ $k ] = (string) get_post_meta( $post_id, $meta, true );
		}
		return $out;
	}

	private static function post_summary( $p ) {
		return array(
			'id'       => (int) $p->ID,
			'type'     => $p->post_type,
			'status'   => $p->post_status,
			'title'    => html_entity_decode( get_the_title( $p ), ENT_QUOTES ),
			'slug'     => $p->post_name,
			'link'     => get_permalink( $p ),
			'modified' => get_post_modified_time( 'c', true, $p ),
			'builder'  => self::builder( $p->ID ),
		);
	}

	/** Remember what is about to change, so it can be undone. */
	private static function remember( $post_id, $change_id, $summary, $fields, $meta_keys ) {
		$p    = get_post( $post_id );
		$prev = array( 'fields' => array(), 'meta' => array() );
		foreach ( $fields as $f ) {
			$prev['fields'][ $f ] = $p->$f;
		}
		foreach ( $meta_keys as $k ) {
			$prev['meta'][ $k ] = metadata_exists( 'post', $post_id, $k ) ? get_post_meta( $post_id, $k, true ) : null;
		}
		$undo = get_post_meta( $post_id, self::UNDO_META, true );
		$undo = is_array( $undo ) ? $undo : array();
		array_unshift(
			$undo,
			array(
				'id'      => $change_id,
				'time'    => time(),
				'summary' => $summary,
				'prev'    => $prev,
			)
		);
		update_post_meta( $post_id, self::UNDO_META, wp_slash( array_slice( $undo, 0, self::UNDO_KEEP ) ) );
	}

	private static function after_save( $post_id ) {
		// Elementor: rebuild this page's CSS file; caches: purge so the change shows straight away.
		if ( class_exists( '\Elementor\Core\Files\CSS\Post' ) && 'elementor' === self::builder( $post_id ) ) {
			try {
				$css = \Elementor\Core\Files\CSS\Post::create( $post_id );
				$css->update();
			} catch ( Throwable $e ) { // phpcs:ignore
				// CSS is regenerated on next view anyway.
			}
		}
		clean_post_cache( $post_id );
		WCC_Maintenance::purge_caches();
	}

	private static function log_change( $change_id, $message, $data = array() ) {
		WCC_Maintenance::log( 'content', $message, array( 'change_id' => $change_id ) + $data );
	}

	/* ------------------------------------------------------------------ */
	/* Site overview                                                        */
	/* ------------------------------------------------------------------ */

	public static function site_info() {
		$menus = array();
		$locs  = get_nav_menu_locations();
		foreach ( wp_get_nav_menus() as $m ) {
			$menus[] = array(
				'id'        => (int) $m->term_id,
				'name'      => $m->name,
				'items'     => (int) $m->count,
				'locations' => array_keys( array_filter( $locs, fn( $id ) => (int) $id === (int) $m->term_id ) ),
			);
		}
		$theme = wp_get_theme();
		$types = array();
		foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $t ) {
			$types[] = array( 'name' => $t->name, 'label' => $t->label, 'count' => (int) ( wp_count_posts( $t->name )->publish ?? 0 ) );
		}
		return array(
			'name'           => get_bloginfo( 'name' ),
			'tagline'        => get_bloginfo( 'description' ),
			'home'           => home_url( '/' ),
			'front_page'     => 'page' === get_option( 'show_on_front' ) ? (int) get_option( 'page_on_front' ) : null,
			'posts_page'     => (int) get_option( 'page_for_posts' ) ?: null,
			'theme'          => array( 'name' => $theme->get( 'Name' ), 'parent' => $theme->parent() ? $theme->parent()->get( 'Name' ) : null ),
			'builders'       => array_values( array_filter( array( defined( 'ELEMENTOR_VERSION' ) ? 'elementor ' . ELEMENTOR_VERSION : null, defined( 'WPB_VC_VERSION' ) ? 'wpbakery' : null, defined( 'ET_BUILDER_VERSION' ) ? 'divi' : null ) ) ),
			'seo_plugin'     => self::seo_plugin(),
			'woocommerce'    => class_exists( 'WooCommerce' ),
			'menus'          => $menus,
			'post_types'     => $types,
			'permalinks'     => (string) get_option( 'permalink_structure' ),
			'site_language'  => get_locale(),
			'timezone'       => wp_timezone_string(),
		);
	}

	/* ------------------------------------------------------------------ */
	/* Posts and pages                                                      */
	/* ------------------------------------------------------------------ */

	public static function list_items( $type, $search, $per_page, $page ) {
		$types = 'any' === $type ? array_values( get_post_types( array( 'public' => true ) ) ) : array( sanitize_key( $type ) );
		$q     = new WP_Query(
			array(
				'post_type'      => $types,
				'post_status'    => array( 'publish', 'draft', 'pending', 'private', 'future' ),
				's'              => $search,
				'posts_per_page' => max( 1, min( 100, (int) $per_page ) ),
				'paged'          => max( 1, (int) $page ),
				'orderby'        => $search ? 'relevance' : 'menu_order title',
				'order'          => 'ASC',
				'no_found_rows'  => false,
			)
		);
		return array(
			'total' => (int) $q->found_posts,
			'items' => array_map( array( __CLASS__, 'post_summary' ), $q->posts ),
		);
	}

	public static function get_item( $id, $with_content = true ) {
		$p = get_post( (int) $id );
		if ( ! $p || 'revision' === $p->post_type ) {
			return self::err( 'No such page or post.', 404 );
		}
		$out = self::post_summary( $p ) + array(
			'parent'         => (int) $p->post_parent,
			'menu_order'     => (int) $p->menu_order,
			'template'       => get_page_template_slug( $p ),
			'excerpt'        => $p->post_excerpt,
			'featured_image' => (int) get_post_thumbnail_id( $p ),
			'seo'            => self::seo_get( $p->ID ),
		);
		if ( $with_content ) {
			$out['content'] = $p->post_content;
		}
		if ( 'elementor' === $out['builder'] ) {
			$out['elementor_outline'] = self::outline( $p->ID );
			$out['note']              = 'This page is built with Elementor: change it with elementor_patch (paths from elementor_outline). Its post content is only a fallback copy.';
		}
		return $out;
	}

	/**
	 * Create or update a page/post. Fields: title, content, excerpt, status, slug, parent, menu_order, template,
	 * featured_image, seo {title, description, focus_keyword}, meta {key: value} (non-protected keys only).
	 */
	public static function save_item( $p, $summary ) {
		$id        = (int) ( $p['id'] ?? 0 );
		$change_id = self::change_id();
		$map       = array( 'title' => 'post_title', 'content' => 'post_content', 'excerpt' => 'post_excerpt', 'status' => 'post_status', 'slug' => 'post_name', 'parent' => 'post_parent', 'menu_order' => 'menu_order' );
		$data      = array();
		foreach ( $map as $in => $col ) {
			if ( array_key_exists( $in, $p ) && null !== $p[ $in ] ) {
				$data[ $col ] = $p[ $in ];
			}
		}
		if ( isset( $data['post_status'] ) && ! in_array( $data['post_status'], array( 'publish', 'draft', 'pending', 'private' ), true ) ) {
			return self::err( 'status must be publish, draft, pending or private.' );
		}

		$seo_keys  = self::seo_keys();
		$meta_set  = array();
		$seo       = isset( $p['seo'] ) && is_array( $p['seo'] ) ? $p['seo'] : array();
		foreach ( $seo as $k => $v ) {
			if ( ! isset( $seo_keys[ $k ] ) ) {
				return self::err( $seo_keys ? "Unknown SEO field “{$k}” (use title, description, focus_keyword)." : 'No supported SEO plugin (Yoast, Rank Math, SEOPress) is active on this site.' );
			}
			$meta_set[ $seo_keys[ $k ] ] = sanitize_text_field( (string) $v );
		}
		if ( isset( $p['meta'] ) && is_array( $p['meta'] ) ) {
			foreach ( $p['meta'] as $k => $v ) {
				$k = (string) $k;
				if ( is_protected_meta( $k, 'post' ) && ! in_array( $k, array_values( $seo_keys ), true ) ) {
					return self::err( "“{$k}” is a protected field — change it with the matching tool instead." );
				}
				$meta_set[ $k ] = $v;
			}
		}
		if ( array_key_exists( 'template', $p ) ) {
			$meta_set['_wp_page_template'] = sanitize_text_field( (string) $p['template'] );
		}
		if ( array_key_exists( 'featured_image', $p ) ) {
			$meta_set['_thumbnail_id'] = (int) $p['featured_image'];
		}

		if ( $id ) {
			$post = get_post( $id );
			if ( ! $post || 'revision' === $post->post_type ) {
				return self::err( 'No such page or post.', 404 );
			}
			if ( isset( $data['post_content'] ) && 'elementor' === self::builder( $id ) ) {
				return self::err( 'This page is built with Elementor — its visible content is in the Elementor layout. Use elementor_patch instead of replacing the post content.' );
			}
			self::remember( $id, $change_id, $summary, array_keys( $data ), array_keys( $meta_set ) );
			if ( $data ) {
				$data['ID'] = $id;
				$r          = wp_update_post( wp_slash( $data ), true );
				if ( is_wp_error( $r ) ) {
					return $r;
				}
			}
		} else {
			$type = sanitize_key( (string) ( $p['type'] ?? 'page' ) );
			if ( ! post_type_exists( $type ) ) {
				return self::err( "No post type “{$type}”." );
			}
			$data['post_type']   = $type;
			$data['post_status'] = $data['post_status'] ?? 'draft';
			$id                  = wp_insert_post( wp_slash( $data ), true );
			if ( is_wp_error( $id ) ) {
				return $id;
			}
			self::remember( $id, $change_id, $summary . ' (created)', array(), array() );
			$undo                          = get_post_meta( $id, self::UNDO_META, true );
			$undo[0]['created']            = true;
			update_post_meta( $id, self::UNDO_META, wp_slash( $undo ) );
		}
		foreach ( $meta_set as $k => $v ) {
			update_post_meta( $id, $k, wp_slash( $v ) );
		}
		if ( $meta_set && ! $data ) {
			// let SEO plugins rebuild their stored copy of the page
			wp_update_post( array( 'ID' => $id ) );
		}
		self::after_save( $id );
		self::log_change( $change_id, $summary ?: 'Updated “' . get_the_title( $id ) . '”', array( 'post_id' => $id ) );
		return array( 'change_id' => $change_id, 'item' => self::get_item( $id, false ) );
	}

	/** Find and replace text in one page/post: title, content, excerpt, SEO fields and the Elementor layout. */
	public static function replace_text( $id, $find, $replace, $summary ) {
		$id   = (int) $id;
		$post = get_post( $id );
		if ( ! $post ) {
			return self::err( 'No such page or post.', 404 );
		}
		$find = (string) $find;
		if ( '' === $find ) {
			return self::err( 'Say what text to find.' );
		}
		$count  = 0;
		$fields = array();
		foreach ( array( 'post_title', 'post_content', 'post_excerpt' ) as $f ) {
			$n = substr_count( (string) $post->$f, $find );
			if ( $n ) {
				$fields[ $f ] = str_replace( $find, (string) $replace, (string) $post->$f );
				$count       += $n;
			}
		}
		$meta = array();
		foreach ( self::seo_keys() as $mk ) {
			$v = (string) get_post_meta( $id, $mk, true );
			$n = substr_count( $v, $find );
			if ( $n ) {
				$meta[ $mk ] = str_replace( $find, (string) $replace, $v );
				$count      += $n;
			}
		}
		$elements = null;
		if ( 'elementor' === self::builder( $id ) ) {
			$elements = self::elementor_data( $id );
			$n        = 0;
			array_walk_recursive(
				$elements,
				function ( &$v ) use ( $find, $replace, &$n ) {
					if ( is_string( $v ) && false !== strpos( $v, $find ) ) {
						$n += substr_count( $v, $find );
						$v  = str_replace( $find, (string) $replace, $v );
					}
				}
			);
			$count += $n;
			if ( ! $n ) {
				$elements = null;
			}
		}
		if ( ! $count ) {
			return array( 'replaced' => 0, 'message' => 'Text not found on this page.' );
		}
		$change_id = self::change_id();
		self::remember( $id, $change_id, $summary, array_keys( $fields ), array_merge( array_keys( $meta ), null !== $elements ? array( '_elementor_data' ) : array() ) );
		if ( $fields ) {
			wp_update_post( wp_slash( array( 'ID' => $id ) + $fields ) );
		}
		foreach ( $meta as $k => $v ) {
			update_post_meta( $id, $k, wp_slash( $v ) );
		}
		if ( null !== $elements ) {
			self::save_elementor( $id, $elements );
		}
		self::after_save( $id );
		self::log_change( $change_id, $summary ?: sprintf( 'Replaced %d × “%s” on “%s”', $count, mb_substr( $find, 0, 60 ), get_the_title( $id ) ), array( 'post_id' => $id ) );
		return array( 'replaced' => $count, 'change_id' => $change_id );
	}

	/* ------------------------------------------------------------------ */
	/* Elementor                                                            */
	/* ------------------------------------------------------------------ */

	public static function elementor_data( $id ) {
		$raw = get_post_meta( (int) $id, '_elementor_data', true );
		if ( is_array( $raw ) ) {
			return $raw;
		}
		$d = json_decode( (string) $raw, true );
		return is_array( $d ) ? $d : array();
	}

	/** Text-bearing settings of an element, for the outline. */
	private static function text_fields( $settings ) {
		$out = array();
		foreach ( (array) $settings as $k => $v ) {
			if ( '_' === $k[0] || preg_match( '/(color|typography|size|width|height|margin|padding|border|align|position|animation|_id$|css|icon$)/', $k ) ) {
				continue;
			}
			if ( is_string( $v ) && '' !== trim( $v ) && ! preg_match( '/^(yes|no|default|custom|none|left|right|center|h[1-6]|#[0-9a-f]{3,8})$/i', $v ) && ! is_numeric( $v ) ) {
				$out[ $k ] = mb_strlen( $v ) > 300 ? mb_substr( wp_strip_all_tags( $v ), 0, 300 ) . '…' : $v;
			} elseif ( is_array( $v ) && isset( $v['url'] ) && is_string( $v['url'] ) && '' !== $v['url'] ) {
				$out[ $k ] = array( 'url' => $v['url'] ) + ( isset( $v['id'] ) ? array( 'id' => $v['id'] ) : array() );
			} elseif ( is_array( $v ) && $v && isset( $v[0] ) && is_array( $v[0] ) ) {
				// repeaters (tabs, slides, list items …): show their text fields
				$items = array();
				foreach ( array_slice( $v, 0, 30 ) as $i => $row ) {
					$t = self::text_fields( $row );
					if ( $t ) {
						$items[ $i ] = $t;
					}
				}
				if ( $items ) {
					$out[ $k ] = $items;
				}
			}
		}
		return $out;
	}

	/**
	 * A compact map of an Elementor page: one line per element with its path (indexes from the top, e.g. "4.0.0.1"),
	 * its type, heading tag and text fields. Paths are what elementor_patch takes.
	 */
	public static function outline( $id ) {
		$rows = array();
		$walk = function ( $els, $prefix ) use ( &$walk, &$rows ) {
			foreach ( (array) $els as $i => $el ) {
				$path = '' === $prefix ? (string) $i : $prefix . '.' . $i;
				$s    = (array) ( $el['settings'] ?? array() );
				$row  = array(
					'path' => $path,
					'type' => ( $el['elType'] ?? '' ) . ( ! empty( $el['widgetType'] ) ? ':' . $el['widgetType'] : '' ),
				);
				foreach ( array( 'header_size', 'title_tag', 'title_size', 'html_tag' ) as $tk ) {
					if ( ! empty( $s[ $tk ] ) && is_string( $s[ $tk ] ) ) {
						$row['tag'] = $s[ $tk ];
					}
				}
				if ( 'widget' === ( $el['elType'] ?? '' ) ) {
					$t = self::text_fields( $s );
					if ( $t ) {
						$row['text'] = $t;
					}
				} elseif ( ! empty( $s['_title'] ) ) {
					$row['name'] = $s['_title'];
				}
				$rows[] = $row;
				if ( ! empty( $el['elements'] ) ) {
					$walk( $el['elements'], $path );
				}
			}
		};
		$walk( self::elementor_data( $id ), '' );
		return $rows;
	}

	private static function &node( array &$els, $path ) {
		$null  = null;
		$parts = '' === (string) $path ? array() : explode( '.', (string) $path );
		$ref   = &$els;
		$node  = null;
		foreach ( $parts as $n => $i ) {
			if ( ! ctype_digit( $i ) ) {
				return $null;
			}
			if ( $n > 0 ) {
				if ( ! isset( $node['elements'] ) || ! is_array( $node['elements'] ) ) {
					return $null;
				}
				$ref = &$node['elements'];
			}
			if ( ! isset( $ref[ (int) $i ] ) ) {
				return $null;
			}
			$node = &$ref[ (int) $i ];
		}
		return $node;
	}

	public static function get_element( $id, $path ) {
		$els  = self::elementor_data( $id );
		$node = &self::node( $els, $path );
		if ( null === $node ) {
			return self::err( "No element at path {$path}.", 404 );
		}
		return $node;
	}

	private static function fresh_ids( &$el ) {
		$el['id'] = substr( md5( uniqid( '', true ) . wp_rand() ), 0, 7 );
		if ( ! isset( $el['settings'] ) || ! is_array( $el['settings'] ) ) {
			$el['settings'] = array();
		}
		if ( ! isset( $el['elements'] ) || ! is_array( $el['elements'] ) ) {
			$el['elements'] = array();
		}
		if ( ! isset( $el['isInner'] ) ) {
			$el['isInner'] = false;
		}
		foreach ( $el['elements'] as &$c ) {
			self::fresh_ids( $c );
		}
	}

	private static function check_element( $el ) {
		if ( ! is_array( $el ) || ! in_array( $el['elType'] ?? '', array( 'section', 'column', 'container', 'widget' ), true ) ) {
			return 'Each element needs elType section, column, container or widget.';
		}
		if ( 'widget' === $el['elType'] && empty( $el['widgetType'] ) ) {
			return 'A widget needs a widgetType (e.g. heading, text-editor, image, button).';
		}
		foreach ( (array) ( $el['elements'] ?? array() ) as $c ) {
			$e = self::check_element( $c );
			if ( $e ) {
				return $e;
			}
		}
		return '';
	}

	/**
	 * Apply edits to an Elementor layout. ops (applied in order; paths refer to the layout as it is when each op runs):
	 *   {op:"set", path, settings:{key: value, …}}            change settings (null removes a key)
	 *   {op:"insert", parent:"4.0" | "" (top level), index, element}   add an element (ids are made for you)
	 *   {op:"replace", path, element}
	 *   {op:"remove", path}
	 *   {op:"move", path, parent, index}
	 */
	public static function patch( $id, $ops, $summary ) {
		$id = (int) $id;
		if ( 'elementor' !== self::builder( $id ) ) {
			return self::err( 'This page is not built with Elementor.' );
		}
		if ( ! is_array( $ops ) || ! $ops ) {
			return self::err( 'Send at least one op.' );
		}
		$els  = self::elementor_data( $id );
		$done = array();
		foreach ( $ops as $n => $op ) {
			$kind = (string) ( $op['op'] ?? '' );
			$at   = 'op ' . ( $n + 1 ) . " ({$kind})";
			switch ( $kind ) {
				case 'set':
					$node = &self::node( $els, (string) ( $op['path'] ?? '' ) );
					if ( null === $node || '' === (string) ( $op['path'] ?? '' ) ) {
						return self::err( "{$at}: no element at path " . ( $op['path'] ?? '?' ) . '.' );
					}
					foreach ( (array) ( $op['settings'] ?? array() ) as $k => $v ) {
						if ( null === $v ) {
							unset( $node['settings'][ $k ] );
						} else {
							$node['settings'][ $k ] = $v;
						}
					}
					unset( $node );
					break;
				case 'insert':
				case 'move':
					$parent = (string) ( $op['parent'] ?? '' );
					if ( 'move' === $kind ) {
						$src = (string) ( $op['path'] ?? '' );
						$tmp = &self::node( $els, $src );
						if ( null === $tmp ) {
							return self::err( "{$at}: no element at path {$src}." );
						}
						$element = $tmp;
						unset( $tmp );
						$r = self::remove_at( $els, $src );
						if ( is_wp_error( $r ) ) {
							return $r;
						}
					} else {
						$element = $op['element'] ?? null;
						$e       = self::check_element( $element );
						if ( $e ) {
							return self::err( "{$at}: {$e}" );
						}
						self::fresh_ids( $element );
					}
					if ( '' === $parent ) {
						$list = &$els;
					} else {
						$p = &self::node( $els, $parent );
						if ( null === $p ) {
							return self::err( "{$at}: no parent at path {$parent}." );
						}
						if ( ! isset( $p['elements'] ) || ! is_array( $p['elements'] ) ) {
							$p['elements'] = array();
						}
						$list = &$p['elements'];
					}
					$index = isset( $op['index'] ) ? max( 0, min( count( $list ), (int) $op['index'] ) ) : count( $list );
					array_splice( $list, $index, 0, array( $element ) );
					unset( $list, $p );
					break;
				case 'replace':
					$node = &self::node( $els, (string) ( $op['path'] ?? '' ) );
					if ( null === $node ) {
						return self::err( "{$at}: no element at path " . ( $op['path'] ?? '?' ) . '.' );
					}
					$e = self::check_element( $op['element'] ?? null );
					if ( $e ) {
						return self::err( "{$at}: {$e}" );
					}
					$element = $op['element'];
					self::fresh_ids( $element );
					$node = $element;
					unset( $node );
					break;
				case 'remove':
					$r = self::remove_at( $els, (string) ( $op['path'] ?? '' ) );
					if ( is_wp_error( $r ) ) {
						return self::err( "{$at}: " . $r->get_error_message() );
					}
					break;
				default:
					return self::err( "{$at}: unknown op (use set, insert, replace, remove, move)." );
			}
			$done[] = $kind;
		}
		$change_id = self::change_id();
		self::remember( $id, $change_id, $summary, array(), array( '_elementor_data' ) );
		$saved = self::save_elementor( $id, $els );
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}
		self::after_save( $id );
		self::log_change( $change_id, $summary ?: 'Edited the layout of “' . get_the_title( $id ) . '”', array( 'post_id' => $id, 'ops' => count( $done ) ) );
		return array( 'change_id' => $change_id, 'applied' => count( $done ), 'outline' => self::outline( $id ) );
	}

	private static function remove_at( array &$els, $path ) {
		$parts = explode( '.', (string) $path );
		$last  = array_pop( $parts );
		if ( '' === (string) $path || ! ctype_digit( (string) $last ) ) {
			return self::err( "No element at path {$path}." );
		}
		if ( ! $parts ) {
			if ( ! isset( $els[ (int) $last ] ) ) {
				return self::err( "No element at path {$path}." );
			}
			array_splice( $els, (int) $last, 1 );
			return true;
		}
		$p = &self::node( $els, implode( '.', $parts ) );
		if ( null === $p || ! isset( $p['elements'][ (int) $last ] ) ) {
			return self::err( "No element at path {$path}." );
		}
		array_splice( $p['elements'], (int) $last, 1 );
		return true;
	}

	private static function save_elementor( $id, $els ) {
		if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->documents ) ) {
			$doc = \Elementor\Plugin::$instance->documents->get( $id, false );
			if ( $doc ) {
				try {
					$doc->save( array( 'elements' => $els ) );
					return true;
				} catch ( Throwable $e ) { // phpcs:ignore
					// fall through to a direct save
				}
			}
		}
		update_post_meta( $id, '_elementor_data', wp_slash( wp_json_encode( $els ) ) );
		return true;
	}

	/* ------------------------------------------------------------------ */
	/* Undo                                                                 */
	/* ------------------------------------------------------------------ */

	public static function changes( $limit = 50 ) {
		global $wpdb;
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT post_id, meta_value FROM {$wpdb->postmeta} WHERE meta_key = %s", self::UNDO_META ) ); // phpcs:ignore
		$out  = array();
		foreach ( $rows as $r ) {
			foreach ( (array) maybe_unserialize( $r->meta_value ) as $u ) {
				$out[] = array( 'change_id' => $u['id'], 'time' => (int) $u['time'], 'post_id' => (int) $r->post_id, 'title' => get_the_title( (int) $r->post_id ), 'summary' => $u['summary'] );
			}
		}
		foreach ( (array) get_option( self::UNDO_OPT, array() ) as $u ) {
			$out[] = array( 'change_id' => $u['id'], 'time' => (int) $u['time'], 'post_id' => null, 'title' => 'Site settings', 'summary' => $u['summary'] );
		}
		usort( $out, fn( $a, $b ) => $b['time'] - $a['time'] );
		return array_slice( $out, 0, max( 1, (int) $limit ) );
	}

	public static function undo( $change_id ) {
		global $wpdb;
		$change_id = preg_replace( '/[^a-z0-9]/', '', (string) $change_id );
		$opt       = (array) get_option( self::UNDO_OPT, array() );
		foreach ( $opt as $i => $u ) {
			if ( $u['id'] === $change_id ) {
				foreach ( $u['prev'] as $k => $v ) {
					update_option( $k, $v );
				}
				array_splice( $opt, $i, 1 );
				update_option( self::UNDO_OPT, $opt, false );
				WCC_Maintenance::purge_caches();
				self::log_change( self::change_id(), 'Undid: ' . $u['summary'], array( 'undo_of' => $change_id ) );
				return array( 'undone' => $change_id );
			}
		}
		$post_id = (int) $wpdb->get_var( $wpdb->prepare( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = %s AND meta_value LIKE %s LIMIT 1", self::UNDO_META, '%' . $wpdb->esc_like( $change_id ) . '%' ) ); // phpcs:ignore
		if ( ! $post_id ) {
			return self::err( 'That change can no longer be undone.', 404 );
		}
		$undo = (array) get_post_meta( $post_id, self::UNDO_META, true );
		foreach ( $undo as $i => $u ) {
			if ( $u['id'] !== $change_id ) {
				continue;
			}
			if ( $i > 0 ) {
				return self::err( 'Later changes were made to this page — undo those first (newest first).', 409 );
			}
			if ( ! empty( $u['created'] ) ) {
				wp_trash_post( $post_id );
			} else {
				if ( $u['prev']['fields'] ) {
					wp_update_post( wp_slash( array( 'ID' => $post_id ) + $u['prev']['fields'] ) );
				}
				foreach ( $u['prev']['meta'] as $k => $v ) {
					if ( '_elementor_data' === $k && null !== $v ) {
						self::save_elementor( $post_id, is_array( $v ) ? $v : (array) json_decode( (string) $v, true ) );
					} elseif ( null === $v ) {
						delete_post_meta( $post_id, $k );
					} else {
						update_post_meta( $post_id, $k, wp_slash( $v ) );
					}
				}
			}
			array_splice( $undo, $i, 1 );
			update_post_meta( $post_id, self::UNDO_META, wp_slash( $undo ) );
			self::after_save( $post_id );
			self::log_change( self::change_id(), 'Undid: ' . $u['summary'], array( 'post_id' => $post_id, 'undo_of' => $change_id ) );
			return array( 'undone' => $change_id, 'post_id' => $post_id );
		}
		return self::err( 'That change can no longer be undone.', 404 );
	}

	/* ------------------------------------------------------------------ */
	/* Media                                                                */
	/* ------------------------------------------------------------------ */

	private static function media_row( $a ) {
		return array(
			'id'       => (int) $a->ID,
			'url'      => wp_get_attachment_url( $a->ID ),
			'file'     => basename( (string) get_attached_file( $a->ID ) ),
			'mime'     => $a->post_mime_type,
			'title'    => $a->post_title,
			'alt'      => (string) get_post_meta( $a->ID, '_wp_attachment_image_alt', true ),
			'caption'  => $a->post_excerpt,
			'uploaded' => $a->post_date_gmt,
		);
	}

	public static function list_media( $search, $per_page, $ids = array() ) {
		$args = array(
			'post_type'      => 'attachment',
			'post_status'    => 'inherit',
			'posts_per_page' => max( 1, min( 100, (int) $per_page ) ),
			'orderby'        => 'date',
			'order'          => 'DESC',
		);
		if ( $ids ) {
			$args['post__in'] = array_map( 'intval', $ids );
		} elseif ( $search ) {
			$args['s'] = $search;
		}
		return array_map( array( __CLASS__, 'media_row' ), get_posts( $args ) );
	}

	public static function update_media( $p, $summary ) {
		$id = (int) ( $p['id'] ?? 0 );
		$a  = get_post( $id );
		if ( ! $a || 'attachment' !== $a->post_type ) {
			return self::err( 'No such image or file.', 404 );
		}
		$change_id = self::change_id();
		$fields    = array();
		if ( isset( $p['title'] ) ) {
			$fields['post_title'] = sanitize_text_field( (string) $p['title'] );
		}
		if ( isset( $p['caption'] ) ) {
			$fields['post_excerpt'] = wp_kses_post( (string) $p['caption'] );
		}
		if ( isset( $p['description'] ) ) {
			$fields['post_content'] = wp_kses_post( (string) $p['description'] );
		}
		self::remember( $id, $change_id, $summary, array_keys( $fields ), isset( $p['alt'] ) ? array( '_wp_attachment_image_alt' ) : array() );
		if ( $fields ) {
			wp_update_post( wp_slash( array( 'ID' => $id ) + $fields ) );
		}
		if ( isset( $p['alt'] ) ) {
			update_post_meta( $id, '_wp_attachment_image_alt', wp_slash( sanitize_text_field( (string) $p['alt'] ) ) );
		}
		WCC_Maintenance::purge_caches();
		self::log_change( $change_id, $summary ?: 'Updated image details: ' . basename( (string) get_attached_file( $id ) ), array( 'post_id' => $id ) );
		return array( 'change_id' => $change_id, 'media' => self::media_row( get_post( $id ) ) );
	}

	/** Add an image/file from a public URL (or base64 data) to the media library. */
	public static function upload_media( $p, $summary ) {
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';
		$name = sanitize_file_name( (string) ( $p['filename'] ?? '' ) );
		if ( ! empty( $p['url'] ) ) {
			$url = esc_url_raw( (string) $p['url'] );
			if ( ! wp_http_validate_url( $url ) ) {
				return self::err( 'That URL cannot be fetched.' );
			}
			$tmp = download_url( $url, 60 );
			if ( is_wp_error( $tmp ) ) {
				return $tmp;
			}
			$name = $name ?: basename( (string) wp_parse_url( $url, PHP_URL_PATH ) );
		} elseif ( ! empty( $p['data'] ) ) {
			$raw = base64_decode( (string) $p['data'], true );
			if ( false === $raw ) {
				return self::err( 'data must be base64.' );
			}
			$tmp = wp_tempnam( $name ?: 'upload' );
			file_put_contents( $tmp, $raw ); // phpcs:ignore
		} else {
			return self::err( 'Send url or data.' );
		}
		$id = media_handle_sideload( array( 'name' => $name ?: 'upload', 'tmp_name' => $tmp ), 0, isset( $p['title'] ) ? sanitize_text_field( (string) $p['title'] ) : null );
		if ( is_wp_error( $id ) ) {
			@unlink( $tmp ); // phpcs:ignore
			return $id;
		}
		if ( isset( $p['alt'] ) ) {
			update_post_meta( $id, '_wp_attachment_image_alt', wp_slash( sanitize_text_field( (string) $p['alt'] ) ) );
		}
		$change_id = self::change_id();
		self::log_change( $change_id, $summary ?: 'Added to the media library: ' . $name, array( 'post_id' => $id ) );
		return array( 'change_id' => $change_id, 'media' => self::media_row( get_post( $id ) ) );
	}

	/* ------------------------------------------------------------------ */
	/* Menus                                                                */
	/* ------------------------------------------------------------------ */

	public static function menu_items( $menu_id ) {
		$items = wp_get_nav_menu_items( (int) $menu_id, array( 'post_status' => 'any' ) );
		if ( false === $items ) {
			return self::err( 'No such menu.', 404 );
		}
		return array_map(
			fn( $i ) => array(
				'id'        => (int) $i->ID,
				'title'     => $i->title,
				'url'       => $i->url,
				'parent'    => (int) $i->menu_item_parent,
				'position'  => (int) $i->menu_order,
				'type'      => $i->type,
				'object'    => $i->object,
				'object_id' => (int) $i->object_id,
			),
			$items
		);
	}

	/**
	 * Add, change or remove a menu item. {menu, id?, title, url?, page_id?, parent?, position?, remove?}
	 */
	public static function save_menu_item( $p, $summary ) {
		$menu = (int) ( $p['menu'] ?? 0 );
		if ( ! wp_get_nav_menu_object( $menu ) ) {
			return self::err( 'No such menu.', 404 );
		}
		$id        = (int) ( $p['id'] ?? 0 );
		$change_id = self::change_id();
		if ( ! empty( $p['remove'] ) ) {
			if ( ! $id ) {
				return self::err( 'Say which item to remove (id).' );
			}
			$title = get_the_title( $id );
			wp_delete_post( $id, true );
			self::log_change( $change_id, $summary ?: "Removed “{$title}” from a menu" );
			return array( 'change_id' => $change_id, 'removed' => $id );
		}
		$args = array( 'menu-item-status' => 'publish' );
		if ( $id ) {
			$cur = wp_setup_nav_menu_item( get_post( $id ) );
			$args += array(
				'menu-item-title'     => $cur->title,
				'menu-item-url'       => $cur->url,
				'menu-item-type'      => $cur->type,
				'menu-item-object'    => $cur->object,
				'menu-item-object-id' => $cur->object_id,
				'menu-item-parent-id' => $cur->menu_item_parent,
				'menu-item-position'  => $cur->menu_order,
			);
		}
		if ( isset( $p['title'] ) ) {
			$args['menu-item-title'] = sanitize_text_field( (string) $p['title'] );
		}
		if ( ! empty( $p['page_id'] ) ) {
			$args['menu-item-type']      = 'post_type';
			$args['menu-item-object']    = get_post_type( (int) $p['page_id'] );
			$args['menu-item-object-id'] = (int) $p['page_id'];
		} elseif ( isset( $p['url'] ) ) {
			$args['menu-item-type'] = 'custom';
			$args['menu-item-url']  = esc_url_raw( (string) $p['url'] );
		}
		if ( isset( $p['parent'] ) ) {
			$args['menu-item-parent-id'] = (int) $p['parent'];
		}
		if ( isset( $p['position'] ) ) {
			$args['menu-item-position'] = (int) $p['position'];
		}
		$r = wp_update_nav_menu_item( $menu, $id, $args );
		if ( is_wp_error( $r ) ) {
			return $r;
		}
		WCC_Maintenance::purge_caches();
		self::log_change( $change_id, $summary ?: ( $id ? 'Changed' : 'Added' ) . ' menu item “' . ( $args['menu-item-title'] ?? '' ) . '”' );
		return array( 'change_id' => $change_id, 'item_id' => (int) $r );
	}

	/* ------------------------------------------------------------------ */
	/* Site settings (a short safe list)                                    */
	/* ------------------------------------------------------------------ */

	const SETTINGS = array( 'blogname', 'blogdescription', 'show_on_front', 'page_on_front', 'page_for_posts', 'admin_email', 'blog_public', 'timezone_string', 'date_format', 'time_format' );

	public static function save_settings( $p, $summary ) {
		$prev = array();
		$set  = array();
		foreach ( (array) $p as $k => $v ) {
			if ( ! in_array( $k, self::SETTINGS, true ) ) {
				return self::err( "“{$k}” can't be changed here. Allowed: " . implode( ', ', self::SETTINGS ) );
			}
			$prev[ $k ] = get_option( $k );
			$set[ $k ]  = is_string( $v ) ? sanitize_text_field( $v ) : $v;
		}
		if ( ! $set ) {
			return self::err( 'Nothing to change.' );
		}
		$change_id = self::change_id();
		$opt       = (array) get_option( self::UNDO_OPT, array() );
		array_unshift( $opt, array( 'id' => $change_id, 'time' => time(), 'summary' => $summary, 'prev' => $prev ) );
		update_option( self::UNDO_OPT, array_slice( $opt, 0, 20 ), false );
		foreach ( $set as $k => $v ) {
			update_option( $k, $v );
		}
		WCC_Maintenance::purge_caches();
		self::log_change( $change_id, $summary ?: 'Changed site settings: ' . implode( ', ', array_keys( $set ) ) );
		return array( 'change_id' => $change_id, 'changed' => array_keys( $set ) );
	}

	/* ------------------------------------------------------------------ */
	/* Anything else: WordPress's own REST API, as the site administrator   */
	/* ------------------------------------------------------------------ */

	public static function rest( $method, $path, $body, $query, $summary ) {
		$method = strtoupper( (string) $method );
		$path   = '/' . ltrim( (string) $path, '/' );
		if ( ! in_array( $method, array( 'GET', 'POST', 'PUT', 'PATCH', 'DELETE' ), true ) ) {
			return self::err( 'method must be GET, POST, PUT, PATCH or DELETE.' );
		}
		if ( 0 === strpos( $path, '/webculture/' ) ) {
			return self::err( 'Use the connector tools directly, not through rest.' );
		}
		if ( 'GET' !== $method && preg_match( '#^/wp/v2/(users|plugins|themes|settings)(/|$)#', $path ) ) {
			return self::err( 'Users, plugins, themes and settings are not changed through rest — use the matching tool, or ask a person.', 403 );
		}
		$req = new WP_REST_Request( $method, $path );
		if ( is_array( $query ) ) {
			$req->set_query_params( $query );
		}
		if ( is_array( $body ) ) {
			$req->set_body_params( $body );
			$req->set_header( 'content-type', 'application/json' );
			$req->set_body( wp_json_encode( $body ) );
		}
		$res  = rest_do_request( $req );
		$data = rest_get_server()->response_to_data( $res, false );
		if ( 'GET' !== $method ) {
			WCC_Maintenance::purge_caches();
			self::log_change( self::change_id(), $summary ?: "{$method} {$path}", array( 'status' => $res->get_status() ) );
		}
		return array( 'status' => $res->get_status(), 'data' => $data );
	}
}
