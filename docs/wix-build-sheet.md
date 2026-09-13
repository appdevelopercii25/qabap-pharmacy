# Wix build sheet (draft 1)

Target: classic Wix Editor site created by duplicating the live site, Velo Dev Mode on,
Wix Multilingual installed (English primary, Arabic secondary, RTL).

## Site theme (Site Design > Theme)
- Colours: Navy `#0F1B45`, Qabas Blue `#1F4FA3`, Sky `#2A8FD1`, Cyan `#3BBFD9`, Mint `#A8DDE0`,
  Ground `#F4F7FC`, Surface `#FFFFFF`, Muted text `#55617F`, Lines `#D6DEEE`.
- Fonts (Wix font picker): Headings **Manrope** 700/800, Body **IBM Plex Sans** 400/500.
  Arabic: **IBM Plex Sans Arabic** for both, or Tajawal if Plex Arabic is missing in Wix.
- Buttons: 8 px radius, primary = Qabas Blue with white text, secondary = outline.

## Homepage sections, in order
1. Header: logo left, menu (Home, About Us, Our Services, Partners, Vendor Portal, Contact),
   language switcher, "Request a Quote" button. Sticky.
2. Hero: eyebrow, H1, lead, two buttons, three badges. Right side: dot-cross visual
   (custom element or exported PNG/MP4 from the prototype).
3. Trust strip: 5 cells, big value + label, ruled with 1 px lines. Use a 5-column strip.
4. Who we are: two-column, title left, body right, "More about us" link.
5. Why Al Qabas: 5 cards in a bordered grid (3 + 2), no shadows.
6. Services: two panels, Pharmaceuticals and Surgical & Healthcare, two-column lists.
7. Navy band: The problem / Our solution, pull quote, CEO message with name and role.
8. Performance: three big figures with coloured top rules. Who we serve: chips.
9. Partners strip: logo row (logos pending).
10. CTA band: gradient Blue -> Sky -> Cyan, two buttons.
11. Footer: logo (white), about, quick links, services, contact, copyright.

## Other pages (from content JSON)
About Us, Our Services, Partners, Vendor Portal (form + ERP login link), Contact (form + map).

## Apps to keep / remove on the duplicate
Keep: Promote SEO, Wix Forms, Wix Chat (optional). Add: Wix Multilingual.
Remove: Wix Hotels, Wix Bookings, Wix Invoices (not relevant to a distributor site).
