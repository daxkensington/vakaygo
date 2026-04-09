"use client";

type MenuItem = {
  name: string;
  description?: string;
  price?: string;
};

type MenuSection = {
  section: string;
  items: MenuItem[];
};

export function DiningMenu({ menu }: { menu: MenuSection[] }) {
  if (!menu || menu.length === 0) return null;

  return (
    <div className="mt-8">
      <h2
        className="text-xl font-bold text-navy-700 mb-4"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Menu
      </h2>

      <div className="bg-cream-50 rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        {menu.map((section, sIdx) => (
          <div key={section.section} className={sIdx > 0 ? "border-t border-cream-200" : ""}>
            {/* Section header */}
            <div className="px-6 pt-5 pb-2">
              <h3 className="text-sm font-semibold text-navy-600 uppercase tracking-wide">
                {section.section}
              </h3>
            </div>

            {/* Items */}
            <div className="px-6 pb-4 space-y-3">
              {section.items.map((item) => (
                <div key={item.name} className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy-700">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-navy-400 mt-0.5 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                  {item.price && (
                    <span className="text-sm font-semibold text-navy-700 shrink-0">
                      {item.price}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
