<?php
/**
 * Business details: the WordPress side of the intake form.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR
 *
 * The client's phone number, email, address and opening hours are baked into
 * page content at export. That is fine until the number changes — then it has
 * to change on the contact section, the footer, and anywhere else it appears,
 * on every page, by hand.
 *
 * So the content carries tokens ({{phone}}, {{email}}, …) and this resolves
 * them at render time from a single set of options. Change the number in
 * Settings → Business details and every page follows at once.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY TOKENS AND NOT A DYNAMIC BLOCK
 *
 * Exactly the reasoning already proven by {{year}}: a token works in template
 * parts and page content alike, survives copy/paste, and a client editing the
 * footer in wp-admin sees plain text rather than a block they might delete.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY NOT A COLOUR PANEL TOO
 *
 * Colours deliberately live in theme.json and are edited at
 * Appearance → Editor → Styles, which is where a block theme puts them. A
 * second colour UI here would be a rival source of truth for the same value.
 * This screen is only for facts WordPress has nowhere else to keep.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Option name → label, for both the settings screen and the token map. */
function vibewp_business_fields() {
	return array(
		'business_name' => __( 'Business name', 'vibewp' ),
		'phone'         => __( 'Phone', 'vibewp' ),
		'email'         => __( 'Email', 'vibewp' ),
		'address'       => __( 'Address', 'vibewp' ),
		'hours'         => __( 'Opening hours', 'vibewp' ),
	);
}

function vibewp_business_option_name( $key ) {
	return 'vibewp_business_' . $key;
}

/**
 * The stored value for a field.
 *
 * business_name falls back to the WordPress site title rather than to an empty
 * string, because the site always has one and an empty brand line in a header
 * is worse than a slightly stale one.
 */
function vibewp_business_value( $key ) {
	$value = get_option( vibewp_business_option_name( $key ), '' );
	if ( '' === $value && 'business_name' === $key ) {
		return get_bloginfo( 'name' );
	}
	return $value;
}

/* ── Settings screen ─────────────────────────────────────────────── */

add_action( 'admin_menu', 'vibewp_business_menu' );
function vibewp_business_menu() {
	add_options_page(
		__( 'Business details', 'vibewp' ),
		__( 'Business details', 'vibewp' ),
		'manage_options',
		'vibewp-business',
		'vibewp_business_page'
	);
}

add_action( 'admin_init', 'vibewp_business_register' );
function vibewp_business_register() {
	foreach ( array_keys( vibewp_business_fields() ) as $key ) {
		register_setting(
			'vibewp_business',
			vibewp_business_option_name( $key ),
			array(
				'type'              => 'string',
				/*
				 * Hours are multi-line, so they keep their newlines; everything
				 * else is a single line. Both are escaped again on output —
				 * sanitising on the way in is not a licence to trust on the way
				 * out, since options can be set by other code.
				 */
				'sanitize_callback' => ( 'hours' === $key )
					? 'sanitize_textarea_field'
					: 'sanitize_text_field',
				'default'           => '',
			)
		);
	}
}

function vibewp_business_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Business details', 'vibewp' ); ?></h1>
		<p style="max-width:60em">
			<?php
			esc_html_e(
				'These appear throughout your site wherever contact details are shown. Change one here and every page updates — you do not need to edit each page.',
				'vibewp'
			);
			?>
		</p>
		<form method="post" action="options.php">
			<?php settings_fields( 'vibewp_business' ); ?>
			<table class="form-table" role="presentation">
				<?php foreach ( vibewp_business_fields() as $key => $label ) : ?>
					<?php $name = vibewp_business_option_name( $key ); ?>
					<tr>
						<th scope="row">
							<label for="<?php echo esc_attr( $name ); ?>">
								<?php echo esc_html( $label ); ?>
							</label>
						</th>
						<td>
							<?php if ( 'hours' === $key ) : ?>
								<textarea id="<?php echo esc_attr( $name ); ?>"
										  name="<?php echo esc_attr( $name ); ?>"
										  rows="7" class="large-text code"><?php
									echo esc_textarea( get_option( $name, '' ) );
								?></textarea>
								<p class="description">
									<?php esc_html_e( 'One line per day or range, e.g. "Monday to Friday: 9am – 5pm".', 'vibewp' ); ?>
								</p>
							<?php else : ?>
								<input type="text"
									   id="<?php echo esc_attr( $name ); ?>"
									   name="<?php echo esc_attr( $name ); ?>"
									   value="<?php echo esc_attr( get_option( $name, '' ) ); ?>"
									   class="regular-text" />
							<?php endif; ?>
						</td>
					</tr>
				<?php endforeach; ?>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

/* ── Token substitution ──────────────────────────────────────────── */

/**
 * Replaces {{phone}}, {{email}}, {{address}}, {{hours}}, {{business_name}}.
 *
 * An UNSET field resolves to an empty string rather than being left as a
 * literal "{{phone}}" on the page. A visible token is the worse failure: it
 * looks broken to a visitor, whereas an empty string just renders nothing.
 *
 * Multi-line hours become <br>-separated, since the value lands inside a
 * paragraph where newlines would collapse to spaces and run the week together.
 */
function vibewp_render_business_tokens( $block_content ) {
	if ( false === strpos( $block_content, '{{' ) ) {
		return $block_content;
	}

	$search  = array();
	$replace = array();

	foreach ( array_keys( vibewp_business_fields() ) as $key ) {
		$value = vibewp_business_value( $key );

		if ( 'hours' === $key ) {
			$lines = array_filter( array_map( 'trim', preg_split( '/\r\n|\r|\n/', (string) $value ) ) );
			$value = implode( '<br />', array_map( 'esc_html', $lines ) );
		} else {
			$value = esc_html( (string) $value );
		}

		$search[]  = '{{' . $key . '}}';
		$replace[] = $value;
	}

	return str_replace( $search, $replace, $block_content );
}

add_filter( 'render_block', 'vibewp_render_business_tokens' );
add_filter( 'the_content', 'vibewp_render_business_tokens' );

/* ── LocalBusiness structured data ───────────────────────────────── */

/**
 * Emits schema.org LocalBusiness JSON-LD on the front page.
 *
 * This is the payoff for collecting hours as a structured week rather than a
 * sentence: Google shows opening hours, phone and address directly in local
 * results, and it can only do that from markup. A text blob cannot produce it.
 *
 * Only fields that are actually set are emitted — an empty telephone property
 * is worse than an absent one.
 */
add_action( 'wp_head', 'vibewp_local_business_schema' );
function vibewp_local_business_schema() {
	if ( ! is_front_page() ) {
		return;
	}

	$data = array(
		'@context' => 'https://schema.org',
		'@type'    => 'LocalBusiness',
		'name'     => vibewp_business_value( 'business_name' ),
		'url'      => home_url( '/' ),
	);

	$phone = vibewp_business_value( 'phone' );
	if ( $phone ) {
		$data['telephone'] = $phone;
	}

	$email = vibewp_business_value( 'email' );
	if ( $email ) {
		$data['email'] = $email;
	}

	$address = vibewp_business_value( 'address' );
	if ( $address ) {
		$data['address'] = array(
			'@type'         => 'PostalAddress',
			'streetAddress' => $address,
		);
	}

	echo "\n<script type=\"application/ld+json\">"
		. wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
		. "</script>\n";
}
