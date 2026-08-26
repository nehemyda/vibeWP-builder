<?php
/**
 * Title: Hero — Split with badge and stats
 * Slug: vibewp/hero-split
 * Categories: vibewp, banner
 * Description: Asymmetric hero with an eyebrow pill, feature list, dual call to action, an image with an overlapping credential badge, and a three-column stats rail.
 * Keywords: hero, header, banner, cta
 * Viewport Width: 1400
 *
 * Layout is carried by assets/sections.css. Edit any text, link, or image
 * here in the block editor — the arrangement holds.
 *
 * @package VibeWP
 */
?>
<!-- wp:group {"tagName":"section","className":"yp-hero"} -->
<section class="wp-block-group yp-hero"><!-- wp:group {"className":"yp-hero__grid"} -->
<div class="wp-block-group yp-hero__grid"><!-- wp:group {"className":"yp-hero__copy"} -->
<div class="wp-block-group yp-hero__copy"><!-- wp:paragraph {"className":"yp-hero__eyebrow"} -->
<p class="yp-hero__eyebrow">Your short announcement or service area</p>
<!-- /wp:paragraph --><!-- wp:heading {"level":1,"className":"yp-hero__heading"} -->
<h1 class="wp-block-heading yp-hero__heading">The headline that says what you do</h1>
<!-- /wp:heading --><!-- wp:paragraph {"className":"yp-hero__body"} -->
<p class="yp-hero__body">A short paragraph explaining the service, who it is for, and why someone should choose you. Two or three sentences is usually enough.</p>
<!-- /wp:paragraph --><!-- wp:list {"className":"yp-hero__features"} -->
<ul class="wp-block-list yp-hero__features"><!-- wp:list-item --><li>First key selling point</li><!-- /wp:list-item --><!-- wp:list-item --><li>Second key selling point</li><!-- /wp:list-item --><!-- wp:list-item --><li>Third key selling point</li><!-- /wp:list-item --><!-- wp:list-item --><li>Fourth key selling point</li><!-- /wp:list-item --></ul>
<!-- /wp:list --><!-- wp:buttons {"className":"yp-hero__actions"} -->
<div class="wp-block-buttons yp-hero__actions"><!-- wp:button {"className":"yp-btn--primary"} -->
<div class="wp-block-button yp-btn--primary"><a class="wp-block-button__link wp-element-button" href="tel:+10000000000">Call us</a></div>
<!-- /wp:button --><!-- wp:button {"className":"yp-btn--outline"} -->
<div class="wp-block-button yp-btn--outline"><a class="wp-block-button__link wp-element-button" href="/contact">Get a quote</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons --></div>
<!-- /wp:group --><!-- wp:group {"className":"yp-hero__media"} -->
<div class="wp-block-group yp-hero__media"><!-- wp:image {"className":"yp-hero__frame"} -->
<figure class="wp-block-image yp-hero__frame"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/hero.jpg' ) ); ?>" alt="Placeholder hero image"/></figure>
<!-- /wp:image --><!-- wp:group {"className":"yp-hero__badge"} -->
<div class="wp-block-group yp-hero__badge"><!-- wp:group {"className":"yp-hero__badge-mark"} -->
<div class="wp-block-group yp-hero__badge-mark"><!-- wp:paragraph --><p>✓</p><!-- /wp:paragraph --></div>
<!-- /wp:group --><!-- wp:group {"className":"yp-hero__badge-text"} -->
<div class="wp-block-group yp-hero__badge-text"><!-- wp:paragraph {"className":"yp-hero__badge-title"} -->
<p class="yp-hero__badge-title">Your credential</p>
<!-- /wp:paragraph --><!-- wp:paragraph {"className":"yp-hero__badge-sub"} -->
<p class="yp-hero__badge-sub">Short supporting line</p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></div>
<!-- /wp:group --></div>
<!-- /wp:group --></div>
<!-- /wp:group --><!-- wp:group {"className":"yp-hero__stats"} -->
<div class="wp-block-group yp-hero__stats"><!-- wp:group {"className":"yp-hero__stat"} -->
<div class="wp-block-group yp-hero__stat"><!-- wp:paragraph {"className":"yp-hero__stat-label"} -->
<p class="yp-hero__stat-label">First stat</p>
<!-- /wp:paragraph --><!-- wp:paragraph {"className":"yp-hero__stat-value"} -->
<p class="yp-hero__stat-value">00</p>
<!-- /wp:paragraph --><!-- wp:paragraph {"className":"yp-hero__stat-note"} -->
<p class="yp-hero__stat-note">Supporting detail</p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --><!-- wp:group {"className":"yp-hero__stat"} -->
<div class="wp-block-group yp-hero__stat"><!-- wp:paragraph {"className":"yp-hero__stat-label"} -->
<p class="yp-hero__stat-label">Second stat</p>
<!-- /wp:paragraph --><!-- wp:paragraph {"className":"yp-hero__stat-value"} -->
<p class="yp-hero__stat-value">00%</p>
<!-- /wp:paragraph --><!-- wp:paragraph {"className":"yp-hero__stat-note"} -->
<p class="yp-hero__stat-note">Supporting detail</p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --><!-- wp:group {"className":"yp-hero__stat"} -->
<div class="wp-block-group yp-hero__stat"><!-- wp:paragraph {"className":"yp-hero__stat-label"} -->
<p class="yp-hero__stat-label">Third stat</p>
<!-- /wp:paragraph --><!-- wp:paragraph {"className":"yp-hero__stat-value"} -->
<p class="yp-hero__stat-value">TEXT</p>
<!-- /wp:paragraph --><!-- wp:paragraph {"className":"yp-hero__stat-note"} -->
<p class="yp-hero__stat-note">Supporting detail</p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></div>
<!-- /wp:group --></section>
<!-- /wp:group -->
