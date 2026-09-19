<?php
/**
 * The page's own title, description and indexing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS IN THE THEME AND NOT A PLUGIN
 *
 * A provisioned site has no SEO plugin, and requiring one would mean the
 * client's meta tags depend on software we install and they must maintain.
 * The values are theirs, in their own post meta, rendered by their own theme
 * — so the site keeps working whatever they do with plugins afterwards, and
 * a client who later installs Yoast can move the values across by hand and
 * turn this off by clearing them.
 *
 * WHY POST META AND NOT A THEME OPTION
 *
 * These are facts about one page. Post meta travels with the post through an
 * export, an import and a revision, and is what any SEO plugin would read
 * too if it ever came to that.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * No fallback invention. If a page has no description, none is emitted —
 * Google writes a better snippet from the page than a truncated first
 * paragraph would be, and a bad description is worse than none.
 *
 * @package vibewp
 */

defined( 'ABSPATH' ) || exit;

/** Post meta keys, written by VibeWP on export. */
const VIBEWP_META_TITLE = '_vibewp_meta_title';
const VIBEWP_META_DESC  = '_vibewp_meta_description';
const VIBEWP_META_NOINDEX = '_vibewp_no_index';
const VIBEWP_META_CANONICAL = '_vibewp_canonical';

/**
 * The whole document title, when the page carries one.
 *
 * pre_get_document_title rather than document_title_parts, because a client
 * who writes a 55-character title means those 55 characters — appending the
 * site name would push it past what Google shows and change what they wrote.
 */
function vibewp_document_title( $title ) {
	if ( ! is_singular() ) {
		return $title;
	}
	$own = get_post_meta( get_queried_object_id(), VIBEWP_META_TITLE, true );
	return $own ? $own : $title;
}
add_filter( 'pre_get_document_title', 'vibewp_document_title' );

/** The meta description, if the page has one. */
function vibewp_meta_description() {
	/*
	 * Stands down for an SEO plugin, for the reason on
	 * vibewp_seo_plugin_active(): this prints a tag rather than filtering one,
	 * so with Yoast active and both fields set the page carried two
	 * descriptions that disagreed. Measured, on a real install.
	 */
	if ( ! is_singular() || vibewp_seo_plugin_active() ) {
		return;
	}
	$desc = get_post_meta( get_queried_object_id(), VIBEWP_META_DESC, true );
	if ( ! $desc ) {
		return;
	}
	printf(
		'<meta name="description" content="%s" />' . "\n",
		esc_attr( $desc )
	);
}
add_action( 'wp_head', 'vibewp_meta_description', 1 );

/**
 * Whether another plugin is already describing this page.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE THEME CHECKS FOR A PLUGIN AT ALL
 *
 * Measured, not guessed. With Yoast active and a description set in BOTH
 * places, the page carried two <meta name="description"> tags that disagreed.
 * The canonical and robots hooks below compose with other software because
 * they go through filters; a printed tag cannot, so it has to stand down.
 *
 * Standing down is the right way round. An SEO plugin is a deliberate choice a
 * client made, it owns a settings screen they can see, and quietly competing
 * with it produces a page neither side intended.
 * ─────────────────────────────────────────────────────────────────────
 */
function vibewp_seo_plugin_active() {
	return defined( 'WPSEO_VERSION' )           // Yoast
		|| defined( 'RANK_MATH_VERSION' )       // Rank Math
		|| defined( 'SEOPRESS_VERSION' )        // SEOPress
		|| class_exists( 'All_in_One_SEO_Pack' ); // AIOSEO
}

/**
 * Open Graph and Twitter tags — the same ones a Vibe site gets.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS HERE AND NOT LEFT TO A PLUGIN
 *
 * A client's site is shared in messages and posts far more than it is searched
 * for, and a link with no preview looks like a link to nothing.
 *
 * It is here because the two halves of this product disagreed. lib/render/seo.ts
 * emits these for every Vibe site; WordPress had nothing of its own and was
 * getting them from Yoast by accident, so taking Yoast off the checklist took
 * link previews with it — the same client, the same content, a worse result on
 * WordPress than on Vibe. That divergence is what the shared-markup
 * architecture exists to prevent, and SEO is no different from a section.
 *
 * KEEP IN STEP WITH socialMetaTags() in lib/render/seo.ts. Same tags, same
 * order, same rule about the image.
 * ─────────────────────────────────────────────────────────────────────
 */
function vibewp_social_meta() {
	if ( ! is_singular() || vibewp_seo_plugin_active() ) {
		return;
	}

	$title     = wp_get_document_title();
	$site_name = get_bloginfo( 'name' );
	$desc      = get_post_meta( get_queried_object_id(), VIBEWP_META_DESC, true );
	$canonical = wp_get_canonical_url();

	printf( '<meta property="og:type" content="website" />' . "\n" );
	printf( '<meta property="og:title" content="%s" />' . "\n", esc_attr( $title ) );
	printf( '<meta property="og:site_name" content="%s" />' . "\n", esc_attr( $site_name ) );

	if ( $desc ) {
		printf( '<meta property="og:description" content="%s" />' . "\n", esc_attr( $desc ) );
	}
	if ( $canonical ) {
		printf( '<meta property="og:url" content="%s" />' . "\n", esc_url( $canonical ) );
	}

	/*
	 * The site logo, and only when it is a real http(s) URL.
	 *
	 * A crawler fetches this from the outside. Claiming an image it cannot
	 * fetch produces exactly the broken preview these tags exist to prevent,
	 * so an unfetchable one means no tag and the smaller card instead.
	 */
	$image = '';
	$logo_id = get_theme_mod( 'custom_logo' );
	if ( $logo_id ) {
		$src = wp_get_attachment_image_url( $logo_id, 'full' );
		if ( $src && preg_match( '#^https?://#i', $src ) ) {
			$image = $src;
		}
	}

	if ( $image ) {
		printf( '<meta property="og:image" content="%s" />' . "\n", esc_url( $image ) );
		printf( '<meta name="twitter:card" content="summary_large_image" />' . "\n" );
	} else {
		printf( '<meta name="twitter:card" content="summary" />' . "\n" );
	}
}
add_action( 'wp_head', 'vibewp_social_meta', 1 );

/**
 * A canonical URL the client has chosen.
 *
 * Through get_canonical_url rather than by printing a second link tag, so
 * there is one canonical on the page instead of two that disagree — core
 * already emits its own, and two conflicting canonicals is worse than a wrong
 * one because a search engine picks for you.
 *
 * Absent means core decides, which is right almost always. This is the
 * override for what core cannot know: the same content published elsewhere,
 * or a campaign URL that should not compete with the page it copies.
 */
function vibewp_canonical( $url, $post ) {
	$own = get_post_meta( $post->ID, VIBEWP_META_CANONICAL, true );
	// Validated on the way in as well, but a stored value is still checked
	// here: a malformed canonical is worse than none, and this is the last
	// point before it reaches the page.
	return ( $own && filter_var( $own, FILTER_VALIDATE_URL ) ) ? $own : $url;
}
add_filter( 'get_canonical_url', 'vibewp_canonical', 10, 2 );

/**
 * Keeping a page out of search results.
 *
 * Through wp_robots rather than by printing a tag, so it composes with
 * whatever else is adding directives instead of contradicting it.
 */
function vibewp_robots( $robots ) {
	if ( is_singular() && get_post_meta( get_queried_object_id(), VIBEWP_META_NOINDEX, true ) ) {
		return wp_robots_no_robots( $robots );
	}
	return $robots;
}
add_filter( 'wp_robots', 'vibewp_robots' );

/**
 * And out of the sitemap.
 *
 * Core's sitemaps do not consult wp_robots, so a noindex page would still be
 * submitted to Google as one worth crawling — telling it two different things
 * about the same URL.
 */
function vibewp_sitemap_skip_noindex( $args ) {
	$args['meta_query'] = array(
		'relation' => 'OR',
		array(
			'key'     => VIBEWP_META_NOINDEX,
			'compare' => 'NOT EXISTS',
		),
		array(
			'key'     => VIBEWP_META_NOINDEX,
			'value'   => '1',
			'compare' => '!=',
		),
	);
	return $args;
}
add_filter( 'wp_sitemaps_posts_query_args', 'vibewp_sitemap_skip_noindex' );
