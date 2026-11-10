/**
 * Claim invitation copy, by the language businesses at the destination use.
 * English is the default; Spanish and French are used where most businesses
 * write in them. Every version says the same true things: the listing is
 * public already, a claim is free, an inquiry is not a reservation, and
 * bookings need separate onboarding through VakayGo. The legal lines (sender,
 * postal address, unsubscribe and, where required, the solicitation notice)
 * are always present.
 */
import { DESTINATION_COUNTRY_CODES } from "@/lib/outreach-country-policy";

export type InvitationLanguage = "en" | "es" | "fr";

const SPANISH = new Set(["DO", "MX", "PR", "CO", "CR"]);
const FRENCH = new Set(["MQ", "GP"]);

export function invitationLanguage(islandSlug: string): InvitationLanguage {
  const country = DESTINATION_COUNTRY_CODES[islandSlug.trim().toLowerCase()];
  if (country && SPANISH.has(country)) return "es";
  if (country && FRENCH.has(country)) return "fr";
  return "en";
}

/**
 * Business names arrive as scraped: ALL CAPS, doubled spaces, "( JET FORCE )".
 * Tidy the spacing, and soften a name written entirely in capitals, so the
 * subject line does not read as shouting. Mixed-case names are left alone.
 */
export function tidyBusinessName(raw: string): string {
  const spaced = raw.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/\s+([,.!?:;])/g, "$1").trim();
  const letters = spaced.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4 || letters !== letters.toUpperCase()) return spaced;
  return spaced.toLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

type Copy = {
  greeting: (title: string) => string;
  intro: (title: string, island: string) => string;
  seeListing: string;
  seeListingLink: (title: string) => string;
  claimText: string;
  claimLinkBefore: string;
  claimLinkText: string;
  claimLinkAfter: string;
  free: string;
  inquiry: string;
  notConfirming: string;
  help: string;
  team: string;
  solicitation: (operator: string) => string;
  unsubscribeText: (url: string) => string;
  unsubscribeLink: string;
  subject: (title: string, island: string) => string;
};

const COPY: Record<InvitationLanguage, Copy> = {
  en: {
    greeting: title => `Hello ${title} team,`,
    intro: (title, island) => `VakayGo is a travel marketplace where visitors look for places to stay, tours, dining and transport in ${island}. ${title} already has a public listing there, and we are inviting your team to review it.`,
    seeListing: "You can see the listing here:",
    seeListingLink: title => `See the ${title} listing`,
    claimText: "If you represent this business, you can start a free listing claim and complete ownership verification here:",
    claimLinkBefore: "If you represent this business, you can ",
    claimLinkText: "start a free listing claim",
    claimLinkAfter: " and complete ownership verification.",
    free: "A listing claim is free. After ownership verification, you can review the business profile and how traveler inquiries are handled.",
    inquiry: "An inquiry is not a reservation. Accepting bookings requires separate supplier onboarding and activation; bookings and checkout must take place through VakayGo.",
    notConfirming: "We are not confirming that booking or payment is enabled for your listing.",
    help: "If the listing details are incorrect or you need help with the claim, reply to this email.",
    team: "The VakayGo Team",
    solicitation: operator => `This message is a business solicitation from VakayGo, operated by ${operator}.`,
    unsubscribeText: url => `To stop these listing invitations, unsubscribe here: ${url}`,
    unsubscribeLink: "Unsubscribe from these listing invitations",
    subject: (title, island) => `${title} is listed on VakayGo (${island}): free to claim`,
  },
  es: {
    greeting: title => `Hola, equipo de ${title}:`,
    intro: (title, island) => `VakayGo es un mercado de viajes donde los visitantes buscan alojamiento, tours, restaurantes y transporte en ${island}. ${title} ya tiene una ficha pública allí, y los invitamos a revisarla.`,
    seeListing: "Pueden ver la ficha aquí:",
    seeListingLink: title => `Ver la ficha de ${title}`,
    claimText: "Si representan a este negocio, pueden reclamar la ficha gratis y verificar que les pertenece aquí:",
    claimLinkBefore: "Si representan a este negocio, pueden ",
    claimLinkText: "reclamar la ficha gratis",
    claimLinkAfter: " y verificar que les pertenece.",
    free: "Reclamar la ficha es gratis. Después de la verificación pueden revisar el perfil del negocio y cómo se atienden las consultas de los viajeros.",
    inquiry: "Una consulta no es una reserva. Para aceptar reservas hace falta completar por separado el registro y la activación como proveedor; las reservas y los pagos se hacen a través de VakayGo.",
    notConfirming: "No confirmamos que las reservas o los pagos estén activados para su ficha.",
    help: "Si los datos de la ficha no son correctos o necesitan ayuda con el reclamo, respondan a este correo.",
    team: "El equipo de VakayGo",
    solicitation: operator => `Este mensaje es una comunicación comercial de VakayGo, operado por ${operator}.`,
    unsubscribeText: url => `Para no recibir más invitaciones, cancelen la suscripción aquí: ${url}`,
    unsubscribeLink: "Cancelar la suscripción a estas invitaciones",
    subject: (title, island) => `${title} aparece en VakayGo (${island}): reclámelo gratis`,
  },
  fr: {
    greeting: title => `Bonjour à l’équipe de ${title},`,
    intro: (title, island) => `VakayGo est une place de marché du voyage où les visiteurs cherchent hébergements, excursions, restaurants et transports en ${island}. ${title} y a déjà une fiche publique, et nous vous invitons à la consulter.`,
    seeListing: "Voir la fiche :",
    seeListingLink: title => `Voir la fiche de ${title}`,
    claimText: "Si vous représentez cette entreprise, vous pouvez revendiquer gratuitement la fiche et confirmer qu’elle vous appartient ici :",
    claimLinkBefore: "Si vous représentez cette entreprise, vous pouvez ",
    claimLinkText: "revendiquer gratuitement la fiche",
    claimLinkAfter: " et confirmer qu’elle vous appartient.",
    free: "La revendication est gratuite. Après vérification, vous pouvez revoir le profil de l’entreprise et la façon dont les demandes des voyageurs sont traitées.",
    inquiry: "Une demande n’est pas une réservation. Accepter des réservations nécessite une inscription et une activation distinctes en tant que prestataire ; les réservations et les paiements se font via VakayGo.",
    notConfirming: "Nous ne confirmons pas que la réservation ou le paiement est activé pour votre fiche.",
    help: "Si les informations de la fiche sont inexactes ou si vous avez besoin d’aide, répondez à cet e-mail.",
    team: "L’équipe VakayGo",
    solicitation: operator => `Ce message est une sollicitation commerciale de VakayGo, exploité par ${operator}.`,
    unsubscribeText: url => `Pour ne plus recevoir ces invitations, désinscrivez-vous ici : ${url}`,
    unsubscribeLink: "Se désinscrire de ces invitations",
    subject: (title, island) => `${title} figure sur VakayGo (${island}) : revendication gratuite`,
  },
};

export type InvitationInput = {
  title: string; island: string; islandSlug: string; listingUrl: string | null; claimUrl: string; unsubscribeUrl: string;
  operator: string; postalAddress: string; solicitationRequired: boolean;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function buildInvitationMessage(input: InvitationInput): { subject: string; text: string; html: string; language: InvitationLanguage } {
  const language = invitationLanguage(input.islandSlug);
  const c = COPY[language];
  const title = tidyBusinessName(input.title);
  // A US-law notice is also given in English, whatever language the message is in.
  const solicitation = input.solicitationRequired
    ? [c.solicitation(input.operator), ...(language === "en" ? [] : [COPY.en.solicitation(input.operator)])] : [];
  const text = [
    c.greeting(title), "",
    c.intro(title, input.island),
    ...(input.listingUrl ? [c.seeListing, input.listingUrl, ""] : [""]),
    c.claimText, input.claimUrl, "",
    c.free, c.inquiry, c.notConfirming, "",
    c.help, "",
    c.team, "support@vakaygo.com", "",
    ...(solicitation.length ? [...solicitation, ""] : []),
    input.operator + " · VakayGo",
    input.postalAddress, "",
    c.unsubscribeText(input.unsubscribeUrl),
  ].join("\n");
  const eTitle = escapeHtml(title);
  const html = `<div lang="${language}" style="font-family:Arial,sans-serif;max-width:560px;line-height:1.6">
  <p>${escapeHtml(c.greeting(title)).replace(eTitle, `<strong>${eTitle}</strong>`)}</p>
  <p>${escapeHtml(c.intro(title, input.island))}</p>${input.listingUrl ? `
  <p><a href="${escapeHtml(input.listingUrl)}">${escapeHtml(c.seeListingLink(title))}</a></p>` : ""}
  <p>${escapeHtml(c.claimLinkBefore)}<a href="${escapeHtml(input.claimUrl)}">${escapeHtml(c.claimLinkText)}</a>${escapeHtml(c.claimLinkAfter)}</p>
  <p>${escapeHtml(c.free)}</p>
  <p>${escapeHtml(c.inquiry)} ${escapeHtml(c.notConfirming)}</p>
  <p>${escapeHtml(c.help)}</p>
  <p>${escapeHtml(c.team)}<br>support@vakaygo.com</p>
  <hr>${solicitation.map(line => `
  <p>${escapeHtml(line)}</p>`).join("")}
  <p>${escapeHtml(input.operator)} · VakayGo<br>${escapeHtml(input.postalAddress).replace(/\r?\n/g, "<br>")}</p>
  <p><a href="${escapeHtml(input.unsubscribeUrl)}">${escapeHtml(c.unsubscribeLink)}</a></p>
</div>`;
  return { subject: c.subject(title, input.island), text, html, language };
}
