# Location quarantine

`location-quarantine.json` temporarily withholds 202 exact public coordinate
observations pending authoritative location review. Businesses and their published
addresses remain available. This does not supply replacement coordinates, merge
businesses, or change database rows.

The complete Grenada map response captured on 2026-10-17 contained 461 distinct
records; 202 occupied a regular 0.00015 degree grid in the rectangle
12.1266963–12.1443963 N, 61.1988325–61.1809825 W. Distinct businesses in that cluster
include Umbrellas Beach Bar and Mount Edgecombe. Their official contact locations
are Grand Anse and Nettle Point/St. Marks, respectively. The Doreen's listing in
the same cluster identifies Cabier Beach; another public Doreen's record has a
different, non-grid coordinate. The historical writer of the grid is unproven.

Primary location references:

- [Umbrellas contact](https://www.umbrellasbeachbargrenada.com/contact)
- [Mount Edgecombe contact](https://www.mountedgecombegrenada.com/contact)
- [Grenada Tourism Authority: Cabier](https://www.puregrenada.com/cabier-ocean-lodge/)

Each entry matches **ID and both coordinate values**. A future correction to
either coordinate automatically stops matching. Another business at the same
point is not affected. The public map applies the shared predicate to both rows
and counts before pagination; public listing detail/metadata omit matching points.

Remove an entry only after reviewing its authoritative location evidence and
public readback. Never apply a blanket coordinate offset or infer ownership,
booking eligibility, visitor access, or opening hours from the quarantine.
