import { BRAND } from "@/lib/pwa/brand";

/**
 * JSX for next/og ImageResponse (Satori): every element with more than one
 * child is a flex container, only inline styles, no external fonts or images.
 */

/** App icon: "P&S" monogram on navy. Maskable icons keep the mark inside the 80% safe zone. */
export function IconArt({ size, maskable }: { size: number; maskable: boolean }) {
  const inset = maskable ? 0 : Math.round(size * 0.06);
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const mark = Math.round(size * (maskable ? 0.27 : 0.32));
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: maskable ? BRAND.navy : "transparent",
      }}
    >
      <div
        style={{
          width: size - inset * 2,
          height: size - inset * 2,
          borderRadius: radius,
          background: `linear-gradient(145deg, ${BRAND.blue} 0%, ${BRAND.navy} 55%, ${BRAND.navyDeep} 100%)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: BRAND.white,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: mark,
            fontWeight: 800,
            letterSpacing: -mark * 0.04,
            lineHeight: 1,
          }}
        >
          P&amp;S
        </div>
        <div
          style={{
            display: "flex",
            marginTop: Math.round(size * 0.05),
            width: Math.round(size * 0.34),
            height: Math.max(2, Math.round(size * 0.025)),
            borderRadius: 999,
            background: BRAND.sky,
          }}
        />
      </div>
    </div>
  );
}

export type OgCardProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: string[];
};

/** 1200×630 share card in the navy/sky palette. */
export function OgCard({ eyebrow, title, subtitle, meta = [] }: OgCardProps) {
  const titleSize = title.length > 48 ? 56 : title.length > 28 ? 68 : 80;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        color: BRAND.white,
        background: `linear-gradient(135deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 55%, ${BRAND.blue} 100%)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 84,
            height: 84,
            borderRadius: 22,
            background: BRAND.sky,
            color: BRAND.navy,
            fontSize: 30,
            fontWeight: 800,
          }}
        >
          P&amp;S
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 24 }}>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 700 }}>{BRAND.name}</div>
          <div style={{ display: "flex", fontSize: 22, color: BRAND.sky, opacity: 0.85 }}>
            {BRAND.strapline}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {eyebrow ? (
          <div style={{ display: "flex", fontSize: 26, color: BRAND.sky, opacity: 0.85, marginBottom: 12 }}>
            {eyebrow}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            fontSize: titleSize,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: -1,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ display: "flex", fontSize: 30, marginTop: 20, color: BRAND.sky, maxWidth: 1000 }}>
            {subtitle}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex" }}>
          {meta.map((item) => (
            <div
              key={item}
              style={{
                display: "flex",
                marginRight: 16,
                padding: "10px 22px",
                borderRadius: 999,
                background: BRAND.white,
                color: BRAND.navy,
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {item}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", width: 160, height: 8, borderRadius: 999, background: BRAND.sky }} />
      </div>
    </div>
  );
}
