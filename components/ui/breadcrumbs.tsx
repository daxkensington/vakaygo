"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { safeJsonLd } from "@/lib/json-ld";

export type BreadcrumbItem = { label: string; href?: string };

/** Breadcrumb names in structured data are plain text: no flag or other emoji. */
export function breadcrumbName(label: string): string {
  return label.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: breadcrumbName(item.label) || item.label,
      ...(item.href ? { item: `https://vakaygo.com${item.href}` } : {}),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-navy-400 flex-wrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <span key={index} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight size={12} className="text-navy-300 shrink-0" />
              )}
              {isLast || !item.href ? (
                <span className="text-navy-600 font-medium">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className="hover:text-gold-500 transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
    </>
  );
}
