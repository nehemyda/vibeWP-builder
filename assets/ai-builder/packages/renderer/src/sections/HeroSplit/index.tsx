import React from "react";
import type { HeroSplitProps } from "./schema";

/* ============================================================
   HeroSplit — the platform renderer (React)

   AUTHORING RULE discovered by this spike:
   the React tree must MIRROR the DOM shape WordPress produces,
   not the shape that would be most natural in React. Where
   Gutenberg wraps text in a <p>, this does too. That parity is
   what lets one stylesheet serve both renders.
   ============================================================ */

export function HeroSplit({ eyebrow, heading, body, features, actions, media, badge, stats }: HeroSplitProps) {
  return (
    <section className="yp-hero">

      <div className="yp-hero__grid">

        <div className="yp-hero__copy">
          {eyebrow && <p className="yp-hero__eyebrow">{eyebrow}</p>}

          <h1 className="yp-hero__heading">{heading}</h1>

          <p className="yp-hero__body">{body}</p>

          <ul className="yp-hero__features">
            {features.map((f) => <li key={f}>{f}</li>)}
          </ul>

          <div className="yp-hero__actions">
            {actions.map((a) => (
              <div key={a.href} className={`yp-btn--${a.variant}`}>
                <a href={a.href}>{a.label}</a>
              </div>
            ))}
          </div>
        </div>

        <div className="yp-hero__media">
          <figure className="yp-hero__frame">
            <img src={media.src} alt={media.alt} />
          </figure>

          {badge && (
            <div className="yp-hero__badge">
              <div className="yp-hero__badge-mark"><p>{badge.mark}</p></div>
              <div className="yp-hero__badge-text">
                <p className="yp-hero__badge-title">{badge.title}</p>
                <p className="yp-hero__badge-sub">{badge.sub}</p>
              </div>
            </div>
          )}
        </div>

      </div>

      <div className="yp-hero__stats">
        {stats.map((s) => (
          <div key={s.label} className="yp-hero__stat">
            <p className="yp-hero__stat-label">{s.label}</p>
            <p className="yp-hero__stat-value">{s.value}</p>
            <p className="yp-hero__stat-note">{s.note}</p>
          </div>
        ))}
      </div>

    </section>
  );
}
