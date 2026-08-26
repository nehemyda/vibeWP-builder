<?php
/**
 * VibeWP — exported theme bootstrap.
 *
 * The only load-bearing logic here is the cascade-layer setup in
 * vibewp_enqueue_styles(). Read the comment there before changing it.
 *
 * @package VibeWP
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'VIBEWP_VERSION', '1.0.0' );

/**
 * Theme supports.
 */
function vibewp_setup() {
	add_theme_support( 'wp-block-styles' );
	add_theme_support( 'responsive-embeds' );
	add_theme_support( 'editor-styles' );
	add_theme_support( 'html5', array( 'style', 'script', 'navigation-widgets' ) );
	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'custom-logo' );

	// The block editor loads the same section CSS, so the editor matches the front end.
	add_editor_style( 'assets/sections.css' );

	register_nav_menus(
		array(
			'primary' => __( 'Primary', 'vibewp' ),
			'footer'  => __( 'Footer', 'vibewp' ),
		)
	);
}
add_action( 'after_setup_theme', 'vibewp_setup' );

/**
 * Stylesheets, and the cascade layers that make them win.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A NORMAL ENQUEUE
 *
 * Unlayered CSS outranks layered CSS in the cascade, no matter how
 * specific the layered selector is. WordPress ships its block styles
 * unlayered. If we simply enqueued sections.css after them, WordPress
 * would still win on every property both files set — box-sizing,
 * margins, button padding — and the design would quietly fall apart.
 *
 * So: declare the layer order, then re-import WordPress's block
 * stylesheet *into* the lower layer, and dequeue the original link.
 * sections.css is wrapped in @layer theme, which sits above it.
 *
 * @import is legal at that position because only @charset and @layer
 * statements may precede it.
 * ─────────────────────────────────────────────────────────────────────
 */
function vibewp_enqueue_styles() {

	// 1. A src-less handle that exists purely to carry the inline layer setup.
	wp_register_style( 'vibewp-layers', false, array(), VIBEWP_VERSION );
	wp_enqueue_style( 'vibewp-layers' );

	// 2. Layer order + WordPress block CSS pulled into the lower layer.
	$block_css = includes_url( 'css/dist/block-library/style.min.css' );

	wp_add_inline_style(
		'vibewp-layers',
		sprintf(
			'@layer plugins, theme; @import url("%s") layer(plugins);',
			esc_url( $block_css )
		)
	);

	// 3. Drop the original unlayered link — it now loads via the @import above.
	wp_dequeue_style( 'wp-block-library' );

	// 4. The design system. sections.css wraps itself in @layer theme.
	wp_enqueue_style(
		'vibewp-sections',
		get_theme_file_uri( 'assets/sections.css' ),
		array( 'vibewp-layers' ),
		VIBEWP_VERSION
	);
}
add_action( 'wp_enqueue_scripts', 'vibewp_enqueue_styles' );

/**
 * Subordinate a third-party plugin stylesheet to the same lower layer.
 *
 * Call this for any plugin whose CSS fights the design system:
 *
 *     vibewp_layer_plugin_style( 'contact-form-7' );
 *
 * @param string $handle Registered style handle to move into @layer plugins.
 */
function vibewp_layer_plugin_style( $handle ) {
	add_action(
		'wp_enqueue_scripts',
		function () use ( $handle ) {
			global $wp_styles;

			if ( empty( $wp_styles->registered[ $handle ] ) ) {
				return;
			}

			$src = $wp_styles->registered[ $handle ]->src;
			if ( ! $src ) {
				return;
			}

			// Relative srcs are site-root relative in WordPress.
			if ( 0 === strpos( $src, '/' ) ) {
				$src = site_url( $src );
			}

			wp_dequeue_style( $handle );
			wp_add_inline_style(
				'vibewp-layers',
				sprintf( '@import url("%s") layer(plugins);', esc_url( $src ) )
			);
		},
		99
	);
}

/**
 * Add the page-level scope class to <body>.
 *
 * Every selector in assets/sections.css is prefixed with .yp-page. That
 * prefix is what gives section rules two classes of specificity, so they
 * outrank WordPress's inline layout CSS (`body .is-layout-flex { gap }`,
 * `body .is-layout-flow > * + * { margin-block-start }`) without any
 * !important. Remove this class and the layout will collapse.
 *
 * @param string[] $classes Body classes.
 * @return string[]
 */
function vibewp_body_class( $classes ) {
	$classes[] = 'yp-page';
	return $classes;
}
add_filter( 'body_class', 'vibewp_body_class' );

/**
 * Mirror the same scope class inside the block editor canvas, so the
 * editor preview matches the front end.
 *
 * @param string $classes Existing admin body classes.
 * @return string
 */
function vibewp_admin_body_class( $classes ) {
	return $classes . ' yp-page ';
}
add_filter( 'admin_body_class', 'vibewp_admin_body_class' );

/**
 * Register the exported sections as block patterns so they can be
 * re-inserted on new pages from the block editor.
 */
function vibewp_register_patterns() {
	if ( ! function_exists( 'register_block_pattern_category' ) ) {
		return;
	}

	register_block_pattern_category(
		'vibewp',
		array( 'label' => __( 'VibeWP sections', 'vibewp' ) )
	);
}
add_action( 'init', 'vibewp_register_patterns' );
