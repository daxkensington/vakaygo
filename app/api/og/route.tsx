import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get("title") || "VakayGo";
  const subtitle =
    searchParams.get("subtitle") || "Caribbean Travel Platform";
  const type = searchParams.get("type") || "";
  const rating = searchParams.get("rating") || "";
  const price = searchParams.get("price") || "";

  const typeBadgeColors: Record<string, { bg: string; text: string }> = {
    stay: { bg: "#D4A843", text: "#fff" },
    excursion: { bg: "#14B8A6", text: "#fff" },
    tour: { bg: "#0D9488", text: "#fff" },
    dining: { bg: "#B8922F", text: "#fff" },
    event: { bg: "#0D9488", text: "#fff" },
    transfer: { bg: "#334155", text: "#fff" },
    transport: { bg: "#1E293B", text: "#fff" },
    vip: { bg: "#B8922F", text: "#fff" },
    guide: { bg: "#D4A843", text: "#fff" },
    spa: { bg: "#EC4899", text: "#fff" },
  };

  const typeLabels: Record<string, string> = {
    stay: "Stay",
    excursion: "Excursion",
    tour: "Tour",
    dining: "Restaurant",
    event: "Event",
    transfer: "Transfer",
    transport: "Transport",
    vip: "VIP",
    guide: "Guide",
    spa: "Spa & Wellness",
  };

  const badgeColor = typeBadgeColors[type] || null;
  const typeLabel = typeLabels[type] || "";

  // Build star display
  const ratingNum = rating ? parseFloat(rating) : 0;
  const fullStars = Math.floor(ratingNum);

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200",
          height: "630",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)",
          fontFamily: "sans-serif",
          padding: "60px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Gold gradient accent */}
        <div
          style={{
            position: "absolute",
            top: "-100px",
            right: "-100px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(212, 168, 67, 0.15) 0%, transparent 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-150px",
            left: "-50px",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(212, 168, 67, 0.1) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Top row: Logo + optional type badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            {/* Logo mark */}
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #D4A843, #B8922F)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "24px",
                fontWeight: 700,
              }}
            >
              V
            </div>
            <span
              style={{
                color: "#D4A843",
                fontSize: "28px",
                fontWeight: 700,
                letterSpacing: "-0.5px",
              }}
            >
              VakayGo
            </span>
          </div>

          {badgeColor && typeLabel && (
            <div
              style={{
                background: badgeColor.bg,
                color: badgeColor.text,
                padding: "8px 24px",
                borderRadius: "40px",
                fontSize: "20px",
                fontWeight: 600,
                display: "flex",
              }}
            >
              {typeLabel}
            </div>
          )}
        </div>

        {/* Middle: Title + Subtitle */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              color: "#FFFFFF",
              fontSize: title.length > 40 ? "48px" : "56px",
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-1px",
              maxWidth: "900px",
              display: "flex",
              flexWrap: "wrap",
            }}
          >
            {title}
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: "26px",
              fontWeight: 400,
              display: "flex",
            }}
          >
            {subtitle}
          </div>

          {/* Rating + Price row */}
          {(ratingNum > 0 || price) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "32px",
                marginTop: "8px",
              }}
            >
              {ratingNum > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg
                      key={i}
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill={i < fullStars ? "#D4A843" : "rgba(255,255,255,0.2)"}
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  ))}
                  <span
                    style={{
                      color: "#D4A843",
                      fontSize: "24px",
                      fontWeight: 600,
                      marginLeft: "8px",
                    }}
                  >
                    {ratingNum.toFixed(1)}
                  </span>
                </div>
              )}
              {price && (
                <div
                  style={{
                    background: "rgba(212, 168, 67, 0.15)",
                    border: "1px solid rgba(212, 168, 67, 0.3)",
                    borderRadius: "12px",
                    padding: "8px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      color: "#D4A843",
                      fontSize: "28px",
                      fontWeight: 700,
                    }}
                  >
                    ${parseFloat(price).toFixed(0)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom: Branding bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: "24px",
          }}
        >
          <span
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: "18px",
              fontWeight: 500,
            }}
          >
            vakaygo.com
          </span>
          <span
            style={{
              color: "rgba(255,255,255,0.3)",
              fontSize: "16px",
            }}
          >
            Caribbean Travel & Experiences
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
