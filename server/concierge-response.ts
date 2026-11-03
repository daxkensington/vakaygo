/** Model output selects known facts; it never supplies visitor-facing factual prose. */
export type ConciergeToolResult = { name: string; result: unknown };
const TOPICS = ["visitor_facts", "booking_status", "support", "claim_business", "add_business", "existing_bookings", "saved_listings", "trip_planning", "choose_destination", "choose_activity", "general_help"] as const;
type Topic = typeof TOPICS[number];
type Plan = { kind: "directory" | "platform" | "clarify"; listingRefs: { island: string; slug: string }[]; topics: Topic[]; language?: Locale };

export const RESPONSE_PLAN_TOOL = {
  name: "respond_with_plan",
  description: "Finish the answer by selecting only listing references returned by tools in THIS request and fixed guidance topics. The server renders the answer. Do not write narrative, hours, access claims, prices or invented references. Use directory for known listings, platform for guidance, clarify when more information is needed. Saved-memory receipts are rendered separately. Support and business inquiries must be reviewed and sent by the visitor using /contact.",
  input_schema: {
    type: "object" as const, additionalProperties: false,
    required: ["kind", "listingRefs", "topics"],
    properties: {
      kind: { type: "string", enum: ["directory", "platform", "clarify"] },
      language: { type: "string", enum: ["en", "es", "fr", "pt", "nl", "de"], description: "Optional requested response language. Omit to use the visitor's current locale." },
      listingRefs: { type: "array", maxItems: 10, items: { type: "object", additionalProperties: false, required: ["island", "slug"], properties: { island: { type: "string" }, slug: { type: "string" } } } },
      topics: { type: "array", maxItems: 4, uniqueItems: true, items: { type: "string", enum: TOPICS } },
    },
  },
};
const LANGUAGE_FALLBACK: Record<Locale, string> = { en: "Language fallback: English.", es: "Idioma alternativo: español.", fr: "Langue de remplacement : français.", pt: "Idioma alternativo: português.", nl: "Taalalternatief: Nederlands.", de: "Ersatzsprache: Deutsch." };

type Phrase = Topic | "directory_intro" | "booking_enabled" | "memory_saved" | "memory_unconfirmed";
type Locale = "en" | "es" | "fr" | "pt" | "nl" | "de";
const COPY: Record<Locale, Record<Phrase, string>> = {
  en: {
    directory_intro: "These directory listings may help with your planning:",
    visitor_facts: "Current admission fees, visitor access, opening hours and reservation requirements are unconfirmed. Check an official visitor source before going.",
    booking_status: "Online bookings, reservation requests and payments are unavailable on VakayGo. This does not establish whether a venue accepts walk-ins or requires reservations.",
    booking_enabled: "Any online booking depends on the exact listing's current eligibility and its booking controls. A directory listing does not confirm a reservation or visitor access.",
    support: "Use the Contact form (/contact) to review and send support or business inquiries. You can also email hello@vakaygo.com.",
    claim_business: "Claim an existing directory listing for free at For Businesses (/for-businesses). A verified claim does not enable bookings or payments.",
    add_business: "A business missing from the directory can create an operator account and add its listing for free (/auth/signup?role=operator&next=/operator/listings/new).",
    existing_bookings: "Review a historical booking and its recorded policy or voucher in My Bookings (/bookings). Contact support for account-specific help.",
    saved_listings: "Sign in to keep directory listings in your Wishlist (/saved). Saving a listing does not reserve it.",
    trip_planning: "Use the Trip Planner (/trips/new) to organize ideas. An itinerary does not confirm admission, visitor access or a reservation.",
    choose_destination: "Which destination would you like to explore?",
    choose_activity: "What would you like to find: a stay, food, a tour or transport?",
    general_help: "I can help you browse directory listings, plan a trip or find VakayGo account and business guidance. Which destination or topic would you like help with?",
    memory_saved: "A preference was saved for future conversations.",
    memory_unconfirmed: "No new saved memory was confirmed.",
  },
  es: {
    directory_intro: "Estas fichas del directorio pueden ayudarte a planificar:",
    visitor_facts: "Las tarifas de entrada, el acceso de visitantes, los horarios y los requisitos de reserva actuales no están confirmados. Consulta una fuente oficial antes de ir.",
    booking_status: "Las reservas, solicitudes de reserva y pagos en línea no están disponibles en VakayGo. Esto no confirma si el lugar acepta visitas sin reserva o exige reservar.",
    booking_enabled: "Las reservas en línea dependen de la habilitación actual de cada ficha y sus controles de reserva. Una ficha no confirma una reserva ni el acceso.",
    support: "Contacta con soporte de VakayGo (/contact) o escribe a hello@vakaygo.com.",
    claim_business: "Reclama gratis una ficha existente en Para empresas (/for-businesses). Una reclamación verificada no habilita reservas ni pagos.",
    add_business: "Si tu negocio no figura en el directorio, puedes crear una cuenta de operador y añadirlo gratis (/auth/signup?role=operator&next=/operator/listings/new).",
    existing_bookings: "Consulta una reserva anterior, su política o comprobante en Mis reservas (/bookings). Contacta con soporte para ayuda sobre tu cuenta.",
    saved_listings: "Inicia sesión para guardar fichas en tu lista de favoritos (/saved). Guardar una ficha no hace una reserva.",
    trip_planning: "Organiza ideas con el planificador de viajes (/trips/new). Un itinerario no confirma entrada, acceso ni reservas.",
    choose_destination: "¿Qué destino quieres explorar?", choose_activity: "¿Buscas alojamiento, comida, una excursión o transporte?",
    general_help: "Puedo ayudarte a explorar el directorio, planificar un viaje o encontrar información de VakayGo para cuentas y negocios. ¿Qué destino o tema te interesa?",
    memory_saved: "Se guardó una preferencia para futuras conversaciones.", memory_unconfirmed: "No se confirmó ningún nuevo recuerdo guardado.",
  },
  fr: {
    directory_intro: "Ces fiches de l'annuaire peuvent vous aider à préparer votre voyage :",
    visitor_facts: "Les droits d'entrée, l'accès des visiteurs, les horaires et les conditions de réservation actuels ne sont pas confirmés. Consultez une source officielle avant de vous déplacer.",
    booking_status: "Les réservations, demandes de réservation et paiements en ligne sont indisponibles sur VakayGo. Cela ne confirme pas si un lieu accepte les visites sans réservation.",
    booking_enabled: "Toute réservation en ligne dépend de l'éligibilité actuelle de la fiche et de ses options de réservation. Une fiche ne confirme ni réservation ni accès.",
    support: "Contactez l'assistance VakayGo (/contact) ou hello@vakaygo.com.",
    claim_business: "Revendiquez gratuitement une fiche existante sur Pour les entreprises (/for-businesses). Une revendication vérifiée n'active ni réservations ni paiements.",
    add_business: "Une entreprise absente de l'annuaire peut créer un compte professionnel et ajouter sa fiche gratuitement (/auth/signup?role=operator&next=/operator/listings/new).",
    existing_bookings: "Consultez une ancienne réservation, ses conditions ou son bon dans Mes réservations (/bookings). Contactez l'assistance pour votre compte.",
    saved_listings: "Connectez-vous pour conserver des fiches dans vos favoris (/saved). Enregistrer une fiche ne réserve rien.",
    trip_planning: "Organisez vos idées avec le planificateur de voyage (/trips/new). Un itinéraire ne confirme ni entrée, ni accès, ni réservation.",
    choose_destination: "Quelle destination souhaitez-vous explorer ?", choose_activity: "Cherchez-vous un hébergement, un restaurant, une excursion ou un transport ?",
    general_help: "Je peux vous aider à explorer l'annuaire, préparer un voyage ou trouver les informations VakayGo pour votre compte ou entreprise. Quelle destination ou quel sujet vous intéresse ?",
    memory_saved: "Une préférence a été enregistrée pour les prochaines conversations.", memory_unconfirmed: "Aucun nouvel enregistrement en mémoire n'a été confirmé.",
  },
  pt: {
    directory_intro: "Estas fichas do diretório podem ajudar no seu planejamento:",
    visitor_facts: "As taxas de entrada, o acesso de visitantes, os horários e as exigências de reserva atuais não estão confirmados. Consulte uma fonte oficial antes de ir.",
    booking_status: "Reservas, pedidos de reserva e pagamentos on-line estão indisponíveis no VakayGo. Isso não confirma se o local aceita visitas sem reserva.",
    booking_enabled: "Qualquer reserva on-line depende da elegibilidade atual da ficha e das opções de reserva. Uma ficha não confirma reserva nem acesso.",
    support: "Entre em contato com o suporte VakayGo (/contact) ou hello@vakaygo.com.",
    claim_business: "Reivindique gratuitamente uma ficha existente em Para empresas (/for-businesses). Uma reivindicação verificada não ativa reservas ou pagamentos.",
    add_business: "Um negócio ausente do diretório pode criar uma conta de operador e adicionar sua ficha gratuitamente (/auth/signup?role=operator&next=/operator/listings/new).",
    existing_bookings: "Consulte uma reserva anterior, sua política ou comprovante em Minhas reservas (/bookings). Contate o suporte para ajuda com sua conta.",
    saved_listings: "Entre na sua conta para guardar fichas nos favoritos (/saved). Salvar uma ficha não faz uma reserva.",
    trip_planning: "Organize ideias com o planejador de viagens (/trips/new). Um itinerário não confirma entrada, acesso ou reservas.",
    choose_destination: "Qual destino você quer explorar?", choose_activity: "Você procura hospedagem, comida, um passeio ou transporte?",
    general_help: "Posso ajudar a explorar o diretório, planejar uma viagem ou encontrar orientações do VakayGo para contas e negócios. Qual destino ou assunto você procura?",
    memory_saved: "Uma preferência foi salva para conversas futuras.", memory_unconfirmed: "Nenhuma nova memória salva foi confirmada.",
  },
  nl: {
    directory_intro: "Deze vermeldingen kunnen helpen bij je reisplanning:",
    visitor_facts: "Actuele toegangsprijzen, bezoekerstoegang, openingstijden en reserveringsvereisten zijn onbevestigd. Raadpleeg een officiële bron voordat je gaat.",
    booking_status: "Online boekingen, reserveringsaanvragen en betalingen zijn niet beschikbaar op VakayGo. Dit bevestigt niet of een locatie bezoekers zonder reservering ontvangt.",
    booking_enabled: "Online boeken hangt af van de actuele geschiktheid en boekingsopties van de vermelding. Een vermelding bevestigt geen reservering of toegang.",
    support: "Neem contact op met VakayGo-support (/contact) of hello@vakaygo.com.",
    claim_business: "Claim gratis een bestaande vermelding via Voor bedrijven (/for-businesses). Een geverifieerde claim schakelt boekingen en betalingen niet in.",
    add_business: "Een bedrijf dat nog ontbreekt kan een operatoraccount aanmaken en gratis een vermelding toevoegen (/auth/signup?role=operator&next=/operator/listings/new).",
    existing_bookings: "Bekijk een eerdere boeking, het vastgelegde beleid of de voucher via Mijn boekingen (/bookings). Neem voor accountvragen contact op met support.",
    saved_listings: "Log in om vermeldingen te bewaren in je verlanglijst (/saved). Opslaan is geen reservering.",
    trip_planning: "Orden ideeën met de reisplanner (/trips/new). Een reisplan bevestigt geen toegang of reservering.",
    choose_destination: "Welke bestemming wil je verkennen?", choose_activity: "Zoek je een verblijf, eten, een excursie of vervoer?",
    general_help: "Ik kan helpen met de gids, reisplanning of VakayGo-informatie voor accounts en bedrijven. Met welke bestemming of welk onderwerp kan ik helpen?",
    memory_saved: "Een voorkeur is opgeslagen voor toekomstige gesprekken.", memory_unconfirmed: "Er is geen nieuw opgeslagen geheugen bevestigd.",
  },
  de: {
    directory_intro: "Diese Verzeichniseinträge können bei der Reiseplanung helfen:",
    visitor_facts: "Aktuelle Eintrittspreise, Besucherzugang, Öffnungszeiten und Reservierungspflichten sind unbestätigt. Prüfe vor dem Besuch eine offizielle Quelle.",
    booking_status: "Online-Buchungen, Reservierungsanfragen und Zahlungen sind auf VakayGo nicht verfügbar. Daraus folgt nicht, ob ein Ort Besuche ohne Reservierung erlaubt.",
    booking_enabled: "Online-Buchungen hängen von der aktuellen Berechtigung und den Buchungsoptionen des Eintrags ab. Ein Eintrag bestätigt weder Reservierung noch Besucherzugang.",
    support: "Kontaktiere den VakayGo-Support (/contact) oder hello@vakaygo.com.",
    claim_business: "Beanspruche einen bestehenden Eintrag kostenlos unter Für Unternehmen (/for-businesses). Eine verifizierte Beanspruchung aktiviert keine Buchungen oder Zahlungen.",
    add_business: "Ein fehlendes Unternehmen kann ein Betreiberkonto erstellen und seinen Eintrag kostenlos hinzufügen (/auth/signup?role=operator&next=/operator/listings/new).",
    existing_bookings: "Prüfe eine frühere Buchung, ihre Bedingungen oder ihren Gutschein unter Meine Buchungen (/bookings). Bei Kontofragen hilft der Support.",
    saved_listings: "Melde dich an, um Einträge in deiner Merkliste (/saved) zu speichern. Speichern ist keine Reservierung.",
    trip_planning: "Ordne Ideen mit dem Reiseplaner (/trips/new). Ein Reiseplan bestätigt weder Eintritt, Zugang noch Reservierungen.",
    choose_destination: "Welches Reiseziel möchtest du erkunden?", choose_activity: "Suchst du eine Unterkunft, Essen, einen Ausflug oder Transport?",
    general_help: "Ich helfe beim Erkunden des Verzeichnisses, der Reiseplanung und mit VakayGo-Informationen für Konten und Unternehmen. Welches Ziel oder Thema interessiert dich?",
    memory_saved: "Eine Präferenz wurde für künftige Gespräche gespeichert.", memory_unconfirmed: "Es wurde kein neuer gespeicherter Eintrag bestätigt.",
  },
};

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 256): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const segment = (value: unknown): value is string => text(value) && value !== "." && value !== "..";
const key = (island: string, slug: string) => JSON.stringify([island, slug]);
export type ConciergeListingCard = { title: string; slug: string; island: string; type: string; price: number | null; currency: string | null; priceUnit: string | null; bookingEligible: boolean; rating: number | null; image: string | null; url: string };
type KnownListing = ConciergeListingCard & { islandName: string };

function knownListings(results: ConciergeToolResult[], bookingsEnabled: boolean): Map<string, KnownListing> {
  const known = new Map<string, KnownListing>();
  const add = (value: unknown, island?: unknown, islandName?: unknown) => {
    if (!object(value)) return;
    const destination = island ?? value.island;
    if (!segment(destination) || !segment(value.slug) || !text(value.title, 200) || !text(value.type, 40)) return;
    const image = value.image ?? (Array.isArray(value.images) ? value.images[0] : null);
    const currency = typeof value.currency === "string" && /^[A-Z]{3}$/.test(value.currency) ? value.currency : null;
    const bookingEligible = bookingsEnabled && value.bookingEligible === true;
    known.set(key(destination, value.slug), {
      title: value.title, slug: value.slug, island: destination, type: value.type,
      price: bookingEligible && currency && typeof value.price === "number" && Number.isFinite(value.price) && value.price > 0 ? value.price : null,
      currency, priceUnit: text(value.priceUnit, 80) ? value.priceUnit : null, bookingEligible,
      rating: typeof value.rating === "number" && Number.isFinite(value.rating) && value.rating >= 0 && value.rating <= 5 ? value.rating : null,
      image: text(image, 2048) && (/^https?:\/\//.test(image) || (image.startsWith("/") && !image.startsWith("//"))) ? image : null,
      islandName: text(islandName ?? value.islandName) ? String(islandName ?? value.islandName) : destination,
      url: `/${encodeURIComponent(destination)}/${encodeURIComponent(value.slug)}`,
    });
  };
  for (const { name, result } of results) {
    if ((name === "search_listings" || name === "compare_listings") && Array.isArray(result)) result.forEach(value => add(value));
    if (name === "get_listing_details" && object(result) && !result.error) add(result);
    if (name === "get_island_info" && object(result) && segment(result.slug) && Array.isArray(result.topRated)) result.topRated.forEach(value => add(value, result.slug, result.name));
  }
  return known;
}

function validPlan(value: unknown, known: Map<string, KnownListing>): Plan | null {
  if (!object(value) || !["kind,listingRefs,topics", "kind,language,listingRefs,topics"].includes(Object.keys(value).sort().join()) || typeof value.kind !== "string" || !["directory", "platform", "clarify"].includes(value.kind)) return null;
  if (Object.hasOwn(value, "language") && (typeof value.language !== "string" || !Object.hasOwn(COPY, value.language))) return null;
  if (!Array.isArray(value.listingRefs) || value.listingRefs.length > 10 || !Array.isArray(value.topics) || value.topics.length > 4) return null;
  if (value.topics.some(topic => typeof topic !== "string" || !TOPICS.includes(topic as Topic)) || new Set(value.topics).size !== value.topics.length) return null;
  const refs: Plan["listingRefs"] = [];
  for (const ref of value.listingRefs) {
    if (!object(ref) || Object.keys(ref).sort().join() !== "island,slug" || !segment(ref.island) || !segment(ref.slug) || !known.has(key(ref.island, ref.slug))) return null;
    if (refs.some(other => other.island === ref.island && other.slug === ref.slug)) return null;
    refs.push({ island: ref.island, slug: ref.slug });
  }
  if (value.kind === "directory" ? refs.length === 0 : refs.length > 0 || value.topics.length === 0) return null;
  return { kind: value.kind as Plan["kind"], listingRefs: refs, topics: value.topics as Topic[], ...(typeof value.language === "string" ? { language: value.language as Locale } : {}) };
}

export const hasConciergeActionResult = (results: ConciergeToolResult[]) => results.some(({ name }) => name === "save_memory");

export function renderConciergeResponse({ plan, results, locale = "en", voiceMode = false, bookingsEnabled = false }: { plan?: unknown; results: ConciergeToolResult[]; locale?: unknown; voiceMode?: boolean; bookingsEnabled?: boolean }): { message: string; listings?: ConciergeListingCard[] } {
  const known = knownListings(results, bookingsEnabled), accepted = validPlan(plan, known);
  const defaultLanguage = typeof locale === "string" && Object.hasOwn(COPY, locale) ? locale as Locale : "en";
  const language = accepted?.language ?? defaultLanguage, copy = COPY[language];
  const selected = accepted ? accepted.listingRefs.map(ref => known.get(key(ref.island, ref.slug))!) : [...known.values()].slice(0, 10);
  const parts: string[] = [];
  const receipts = new Set<string>();
  for (const { name, result } of results) {
    if (name === "submit_support_or_business_inquiry") {
      receipts.add(copy.support);
    } else if (name === "save_memory") receipts.add(object(result) && result.saved === true ? copy.memory_saved : copy.memory_unconfirmed);
  }
  parts.push(...receipts);
  if (selected.length) {
    const visible = selected.slice(0, voiceMode ? 2 : 10);
    parts.push(`${copy.directory_intro}\n${visible.map(item => `- “${item.title}” — ${item.islandName}`).join("\n")}`);
    parts.push(copy.visitor_facts);
    parts.push(bookingsEnabled ? copy.booking_enabled : copy.booking_status);
  }
  const topics = accepted?.topics ?? [];
  for (const topic of topics) {
    if ((topic === "visitor_facts" || topic === "booking_status") && selected.length) continue;
    parts.push(topic === "booking_status" && bookingsEnabled ? copy.booking_enabled : copy[topic]);
  }
  if (topics.some(topic => topic === "claim_business" || topic === "add_business")) parts.push(copy.support);
  if (!parts.length) parts.push(copy.general_help);
  const unsupportedPlanLanguage = object(plan) && Object.hasOwn(plan, "language") && (typeof plan.language !== "string" || !Object.hasOwn(COPY, plan.language));
  const unsupportedLocale = typeof locale !== "string" || !Object.hasOwn(COPY, locale);
  if (!accepted?.language && (unsupportedLocale || unsupportedPlanLanguage)) parts.unshift(LANGUAGE_FALLBACK[language]);
  return {
    message: [...new Set(parts)].join("\n\n"),
    ...(selected.length ? { listings: selected.map(item => {
      const { title, slug, island, type, price, currency, priceUnit, bookingEligible, rating, image, url } = item;
      return { title, slug, island, type, price, currency, priceUnit, bookingEligible, rating, image, url };
    }) } : {}),
  };
}
