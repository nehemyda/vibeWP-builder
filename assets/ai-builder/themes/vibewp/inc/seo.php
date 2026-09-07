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
	if ( ! is_singular() ) {
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
