# Public Domain / Open-Access Image Sources — Codex Handoff

**Date:** 2026-05-29  
**Project context:** build source adapters / scrapers for public-domain or open-access image collections. Current first target is **The Met**; later expand to all relevant image/museum/archive sources below.

## Core rule

Do **not** collapse everything into a generic `public_domain=true`.

For every image/object store the source URL, exact license/rights text, source institution, image URL, thumbnail URL, IIIF manifest/info URL when present, and the raw JSON/XML/HTML fragment used for normalization.

Distinguish:

- underlying work public domain
- digital reproduction rights
- metadata license
- image file license
- attribution requirement
- commercial-use confidence

## Normalized record fields

```text
source_id
provider_name
provider_record_id
object_url
api_url
image_url
image_derivative_url
thumbnail_url
iiif_manifest_url
iiif_image_info_url
title
creator_artist
date_display
culture
period
geography
department
classification
object_type
materials
techniques
dimensions
description
tags_subjects_keywords
rights_label
license_url
is_public_domain
is_open_access
commercial_use_ok
requires_attribution
source_institution_credit
retrieved_at
raw_json_or_xml
```

## Suggested rights enum

```python
status = Literal[
    "cc0",
    "public_domain",
    "no_known_copyright_restrictions",
    "open_license",
    "rights_mixed",
    "restricted",
    "unknown",
]
```

Default behavior:

- `cc0`: commercial use ok; attribution not legally required but still store credit.
- `public_domain`: likely ok, but check digital-copy rights.
- `no_known_copyright_restrictions`: useful but not equivalent to CC0; confidence medium.
- `rights_mixed`: store metadata but do not mark image reusable.
- `unknown`: internal research only.

## Suggested provider adapter

```python
class ProviderAdapter:
    provider_id: str
    provider_name: str
    supports_keyword_search: bool
    supports_public_domain_filter: bool
    supports_image_filter: bool
    supports_iiif: bool
    requires_api_key: bool

    def search(self, query: str, page: int = 1, page_size: int = 50, filters: dict | None = None): ...
    def fetch_record(self, provider_record_id: str): ...
    def normalize_record(self, raw): ...
    def get_image_candidates(self, raw): ...
    def is_reusable(self, raw): ...
```

## Global implementation notes

1. Prefer official APIs, downloadable datasets, OAI-PMH, IIIF manifests, and documented endpoints.
2. Avoid scraping pages when official API/dataset exists.
3. Do not bypass anti-bot systems.
4. Respect rate limits, robots.txt, and Terms of Service.
5. For aggregators, resolve the original source institution whenever possible.
6. Keep raw responses so rights/metadata can be re-normalized later.
7. Treat The Public Domain Review / Public Domain Image Archive as discovery sources unless permission is granted for automated use.

## Issue labels

```text
p0-clean-api
p0-high-value
p1-api-key
p1-iiif
p1-static-dataset
p2-needs-research
p2-manual-or-crawl
rights-clean-cc0
rights-mixed
aggregator
book-plate-archive
museum-object-api
asian-art
jewelry
decorative-arts
natural-history
medical-anatomical
design
```

## Initial keyword sets

**Jewelry / ornament / object sources:**  
`jewelry`, `jewellery`, `ring`, `bracelet`, `necklace`, `earring`, `pendant`, `brooch`, `fibula`, `amulet`, `torc`, `diadem`, `bead`, `intaglio`, `cameo`, `gold`, `silver`, `bronze`, `metalwork`, `enamel`, `jade`, `coral`, `pearl`, `shell`, `ornament`, `decorative arts`, `applied arts`

**Asian art:**  
`Japan`, `Japanese`, `China`, `Chinese`, `Korea`, `Korean`, `India`, `Indian`, `South Asia`, `Himalayan`, `Tibet`, `Nepal`, `Islamic`, `Persia`, `Mughal`, `Qing`, `Ming`, `Edo`, `Meiji`, `lacquer`, `netsuke`, `inro`, `jade`, `bronze vessel`, `ceramic`, `porcelain`, `silk`, `textile`, `kimono`, `woodblock`

**Natural morphology / Gio Sampietro-adjacent references:**  
`shell`, `coral`, `fossil`, `botanical`, `seed`, `pod`, `root`, `fungus`, `mushroom`, `lichen`, `algae`, `radiolaria`, `diatom`, `sponge`, `bone`, `anatomy`, `organ`, `cell`, `microscope`, `growth`, `fold`, `spiral`, `wave`, `erosion`

**Book / plate archives:**  
`ornament`, `pattern`, `decorative`, `jewelry`, `metalwork`, `goldsmith`, `silversmith`, `botanical illustration`, `natural history`, `plates`, `catalogue`, `manual`, `design`, `fashion plate`, `textile pattern`, `craft`

## Recommended implementation order

### Phase 1 — clean object APIs
Met, Cleveland Museum of Art, Art Institute of Chicago, Smithsonian Open Access, V&A, Rijksmuseum.

### Phase 2 — book/plate archives
Internet Archive, NYPL, BHL, Wellcome, Gallica, e-rara, e-manuscripta.

### Phase 3 — design/decorative arts
Cooper Hewitt, MKG Hamburg, Minneapolis Institute of Art, Walters, Getty, Harvard.

### Phase 4 — aggregators/discovery
Europeana, Openverse, Wikimedia Commons, Flickr Commons, PDR/PDIA discovery-only.

### Phase 5 — research sources
NDL Japan, LACMA, Philadelphia Museum of Art, Brooklyn Museum, British Library, NLM, Polona, SLUB Dresden, NAL.

---

# Source registry

| provider_id | Source | Priority | Type | Best for | Access / API | Rights | Implementation note |
|---|---|---:|---|---|---|---|---|
| `met` | **The Met Collection API**<br><br>URLs: https://metmuseum.github.io/ ; https://www.metmuseum.org/hubs/open-access ; https://github.com/metmuseum/openaccess | P0 | Museum object API | Asian art, ancient jewelry, rings, amulets, metalwork, costume, decorative arts | REST JSON; no key; search endpoint /public/collection/v1/search; object endpoint /objects/{objectID}; use hasImages=true and isPublicDomain=true | Strong: public-domain images/data under Open Access/CC0 where isPublicDomain=true | Implement first. Search returns IDs, then fetch each object. Store objectURL, primaryImage, primaryImageSmall, department, objectName, medium, culture, period, tags. |
| `vam` | **V&A Collections API**<br><br>URLs: https://developers.vam.ac.uk/guide/v2/ ; https://developers.vam.ac.uk/guide/v2/images/iiif.html | P0 | Museum API + IIIF | Jewelry, fashion, textiles, design, ornament, metalwork, ceramics, Asian decorative arts | REST JSON; IIIF Image/Presentation; object id systemNumber; image asset ids in records; no obvious mandatory key | Mixed rights; check per object/image | High priority for jewelry/design. Build search+metadata first; image ingestion only after rights parser. |
| `europeana` | **Europeana**<br><br>URLs: https://api.europeana.eu/ ; https://apis.europeana.eu/ ; https://europeana.atlassian.net/wiki/spaces/EF/pages/2385739812/Search+API+Documentation | P0/P1 | Aggregator API | Cross-institution discovery, rights-filtered European cultural data | API key required via free account; search API with rights/media filters | Mixed but filterable; store rights URI exactly | Use as discovery layer. Resolve original provider when possible. |
| `rijksmuseum` | **Rijksmuseum Data Services**<br><br>URLs: https://data.rijksmuseum.nl/ ; https://data.rijksmuseum.nl/docs/ ; https://data.rijksmuseum.nl/docs/iiif/image ; https://data.rijksmuseum.nl/docs/oai-pmh | P0 | Data services + IIIF + OAI-PMH | Decorative arts, prints, jewelry, Asian export objects, metalwork, ceramics | Search API / OAI-PMH / LDES / IIIF Image / IIIF Presentation; OAI-PMH no key; verify Search API auth | Open-friendly but parse rights | Good generic IIIF-aware adapter. Consider OAI-PMH bulk harvesting separately. |
| `smithsonian_open_access` | **Smithsonian Open Access**<br><br>URLs: https://www.si.edu/openaccess ; https://www.si.edu/openaccess/devtools ; https://www.si.edu/openaccess/faq | P0 | Multi-museum API | National Museum of Asian Art, natural history, design, craft, decorative arts, scientific specimens, 3D | API hosted via api.data.gov; API key required | CC0 where designated as Smithsonian Open Access | Nested JSON. Parse unitCode, online_media, content, license/usage. Very high value. |
| `cleveland_art` | **Cleveland Museum of Art**<br><br>URLs: https://openaccess-api.clevelandart.org/ ; https://www.clevelandart.org/open-access ; https://github.com/ClevelandMuseumArt/openaccess | P0 | Open Access API | Asian art, decorative arts, jewelry, Egyptian, sculpture, arms/armor | REST JSON; no key; documented search/pagination; full dataset also available | Strong CC0/open-access for marked datasets/image assets | Excellent second adapter after Met. Normalize share_license_status, images, type, technique, culture. |
| `harvard_art_museums` | **Harvard Art Museums**<br><br>URLs: https://harvardartmuseums.org/collections/api ; https://github.com/harvardartmuseums/api-docs | P0/P1 | Museum REST API | Asian art, ancient objects, works on paper, materials, techniques | REST API; API key required; base https://api.harvardartmuseums.org | Mixed; parse copyright, imagepermissionlevel, creditline | Strong metadata. Make auth configurable via env var. |
| `artic` | **Art Institute of Chicago**<br><br>URLs: https://api.artic.edu/ ; https://www.artic.edu/open-access/public-api ; https://www.artic.edu/open-access/open-access-images | P0 | Museum API + IIIF | Asian art, prints, textiles, decorative arts, paintings, modern objects | REST JSON; no key; IIIF through image_id; public-domain manifests available | Public-domain filter/fields available; still parse rights | Very good API shape. Implement image URL builder from image_id. |
| `getty_museum` | **Getty Museum Collection API**<br><br>URLs: https://data.getty.edu/ ; https://data.getty.edu/museum/collection/docs/ | P0/P1 | REST + SPARQL / linked data | Antiquities, manuscripts, decorative arts, sculpture, photographs, provenance | REST and SPARQL; no obvious key; designed for records, changes, collection-wide queries | Mixed; open content where marked | Start with simple search/fetch; SPARQL later. |
| `walters` | **Walters Art Museum**<br><br>URLs: https://api.thewalters.org/ ; https://thewalters.org/about/policies/rights-reproductions/ ; https://github.com/WaltersArtMuseum/api-thewalters-org | P0/P1 | Museum API | Ancient jewelry, Islamic art, manuscripts, medieval objects, enamel, metalwork, small precious objects | Public API; records include metadata/images; verify current key/sandbox status | Public-domain images made rights- and royalty-free where believed PD | Very relevant for jewelry and small objects. |
| `mia` | **Minneapolis Institute of Art**<br><br>URLs: https://collections.artsmia.org/info/open-access ; https://github.com/artsmia/collection | P1 | Static JSON metadata dataset | Asian art, decorative arts, textiles, ceramics, ritual objects, craft | JSON metadata on GitHub; not mainly live search | Metadata CC0; images checked per object | Batch import and build local search index. |
| `cooper_hewitt` | **Cooper Hewitt**<br><br>URLs: https://apidocs.cooperhewitt.org/api-home/ ; https://github.com/cooperhewitt/collection | P0/P1 | GraphQL API + JSON dataset | Design, jewelry, ornament, textiles, product design, decorative arts, graphic design | GraphQL API; GitHub JSON collection data; verify auth | Metadata CC0; images mixed | Use static JSON first; GraphQL later. High value for ornament/design taxonomy. |
| `mkg_hamburg` | **MKG Hamburg**<br><br>URLs: https://sammlungonline.mkg-hamburg.de/ ; https://github.com/MKGHamburg ; https://d-nb.info/1155476069/34 | P1 | Applied arts / LIDO XML / open access | Applied arts, East Asian art, jewelry, antiquities, European craft, design, ornament, textiles | Metadata as LIDO XML on GitHub per docs/papers; online collection searchable | CC0 for public-domain works where open; parse rights | Implement LIDO XML parser after confirming active repo. |
| `paris_musees` | **Paris Musées**<br><br>URLs: https://www.parismusees.paris.fr/en/news/open-content-150000-works-from-the-museum-collections-of-the-city-of-paris-freely-available ; https://creativecommons.org/2020/01/10/paris-musees-releases-100000-works-into-the-public-domain/ | P1 | Multi-museum GraphQL / open content | Fashion, decorative arts, prints, drawings, photography, historical objects | GraphQL API announced/released; current endpoint/docs need discovery | Open-content public-domain works under CC0; mixed outside open content | Research endpoint first; inspect current portal/network calls if docs not obvious. |
| `nga` | **National Gallery of Art, Washington**<br><br>URLs: https://www.nga.gov/artworks/free-images-and-open-access ; https://github.com/NationalGalleryOfArt/opendata | P1 | Open data GitHub dataset + APIs | Public-domain images, art metadata, works on paper, decorative references | GitHub dataset; data services APIs exist; verify production endpoints | Dataset CC0; open-access images free where marked | Batch import from GitHub likely easiest. |
| `smk` | **SMK — National Gallery of Denmark**<br><br>URLs: https://www.smk.dk/en/article/smk-api/ ; https://api.smk.dk/api/v1/docs ; https://www.smk.dk/en/article/free-download-of-images/ | P1 | Museum API | Public-domain images, paintings, prints, works on paper | JSON API; no key reported in public references; verify | Public-domain images where allowed; some CC BY-SA/restricted possible | Good clean source. Build rights parser. |
| `finnish_national_gallery` | **Finnish National Gallery**<br><br>URLs: https://kokoelma.kansallisgalleria.fi/en/api-sovelluskehittajille ; https://pro.europeana.eu/post/hello-cc0-the-finnish-national-gallery-opens-up-its-collections | P1 | Museum API + data package | Finnish art, public-domain images, open dataset | API and data package; endpoint details to verify | CC0 for digital reproductions of out-of-copyright works | Good multilingual/open-data source. |
| `loc` | **Library of Congress**<br><br>URLs: https://www.loc.gov/apis/ ; https://www.loc.gov/apis/json-and-yaml/requests/ ; https://www.loc.gov/apis/additional-apis/prints-and-photographs-api/ | P0/P1 | Library JSON API / Prints & Photographs API | Prints, posters, photos, maps, drawings, design ephemera, visual culture | Add ?fo=json to supported endpoints; PPOC JSON API; no key | Mixed; parse rights_advisory/access fields | Strong discovery source; do not assume PD. |
| `nypl` | **NYPL Digital Collections**<br><br>URLs: https://api.repo.nypl.org/ ; https://api.repo.nypl.org/api_documentation_v1 ; https://www.nypl.org/research/resources/public-domain-collections | P0 | Library/museum API | Fashion plates, ornament books, botanical illustration, Japanese prints, maps, design ephemera | API key required; publicDomainOnly=true filter | Public-domain filter available | High-value book/plate source. Use for ornament/jewelry/fashion/botany. |
| `openverse` | **Openverse**<br><br>URLs: https://api.openverse.org/ ; https://openverse.org/about ; https://docs.openverse.org/api/ | P0/P1 | Aggregator API | Broad fallback search across openly licensed/public-domain media | REST API; auth may be needed for heavy use; check docs | Open/public-domain but license accuracy must be verified | Discovery layer, not canonical source. |
| `wikimedia_commons` | **Wikimedia Commons**<br><br>URLs: https://commons.wikimedia.org/wiki/Commons:API/MediaWiki ; https://www.mediawiki.org/wiki/API:Imageinfo ; https://commons.wikimedia.org/wiki/Commons:Machine-readable_data | P0/P1 | MediaWiki API | Public-domain museum images, structured data, broad media discovery | MediaWiki Action API; no key; use imageinfo extmetadata\|url\|size\|mime | Mixed open licenses/PD; file license per file page | Need robust license parser. Useful for resolving images from Wikidata/Openverse/PDR. |
| `internet_archive` | **Internet Archive**<br><br>URLs: https://archive.org/developers/ ; https://archive.org/developers/index-apis.html ; https://archive.org/help/aboutsearch.htm ; https://archive.org/developers/metadata.html | P0 | Digital library APIs | Scanned books, ornament books, jewelry manuals, craft manuals, old catalogues, botanical plates | Advanced Search API; Metadata API /metadata/{identifier}; files listed in response; no key for read | Mixed; parse licenseurl/rights | Very important. Implement book-level ingestion and page-image extraction separately. |
| `bhl` | **Biodiversity Heritage Library**<br><br>URLs: https://about.biodiversitylibrary.org/tools-and-services/developer-and-data-tools/ ; https://www.biodiversitylibrary.org/docs/api3.html ; https://registry.opendata.aws/bhl-open-data/ | P0 | Natural-history digital library API + bulk data | Shells, corals, botanical plates, fossils, animals, scientific illustration | API key required; API v3 includes full-text search; AWS bulk data/images | Open-access but item/page rights still need storage | High value for morphology. Build book/page model. |
| `gallica_bnf` | **Gallica / BnF**<br><br>URLs: https://api.bnf.fr/fr/api-document-de-gallica ; https://api.bnf.fr/fr/recherche?f%5B0%5D=categories%3A1158 ; https://api.bnf.fr/fr/wrapper-python-pour-les-api-gallica | P1 | National library APIs / SRU / OAI-PMH / IIIF | Illustrated books, ornament, fashion plates, Japanese prints, manuscripts, photographs | SRU search; Document API by ARK; IIIF; OAI-PMH possible; mostly no key | Mixed; Gallica conditions may restrict digital copies | Useful but rights-conservative. Implement search -> ARK -> doc metadata -> IIIF. |
| `wellcome` | **Wellcome Collection**<br><br>URLs: https://developers.wellcomecollection.org/ ; https://developers.wellcomecollection.org/docs/iiif ; https://developers.wellcomecollection.org/api/iiif | P0 | Catalogue API + IIIF | Medical/anatomical imagery, natural history, bodies, diagrams, scientific visual culture | Catalogue API; IIIF Image API for open images; no key | Mixed/open; parse license/rights | Strong for anatomy/morphology. Implement catalogue search + IIIF. |
| `ndl_japan` | **National Diet Library of Japan**<br><br>URLs: https://www.ndl.go.jp/en/ ; https://dl.ndl.go.jp/ | P2 | National library / IIIF where available | Japanese illustrated books, woodblock prints, diagrams, pattern references | Search/browse; IIIF support exists for some digitized material; endpoint research needed | Mixed; browsing conditions vary | Create research issue first. High cultural relevance. |
| `flickr_commons` | **Flickr Commons**<br><br>URLs: https://www.flickr.com/services/api/ ; https://www.flickr.org/programs/flickr-commons/no-known-copyright-restrictions-how-it-works/ | P2 | Flickr API / institutional Commons | Historical photos, institutional archives, British Library images, maps, ethnographic photos | Flickr API key required; search by license/group/user | No known copyright restrictions is not CC0; store exact label | Discovery layer. Rights nuanced. |
| `e_rara` | **e-rara**<br><br>URLs: https://www.e-rara.ch/wiki/apiinfo | P1 | Rare-book platform / OAI-PMH / IIIF | Rare books, scientific plates, ornament, technical diagrams, early printed books | OAI-PMH, full text, PDFs, RIS, IIIF; no public key needed | Mixed by item | Generic OAI-PMH + IIIF adapter; book/page model. |
| `e_manuscripta` | **e-manuscripta**<br><br>URLs: https://www.e-manuscripta.ch/wiki/apiinfo ; https://iiif.io/guides/guides/e-manuscripta.ch/ | P1 | Manuscript platform / OAI-PMH / IIIF | Manuscripts, diagrams, marginalia, alchemical/technical imagery | OAI-PMH, IIIF manifests, PDFs/full text where available | Mixed by item | Share code with e-rara. |
| `digitalt_museum` | **DigitaltMuseum**<br><br>URLs: https://dok.digitaltmuseum.org/en/api ; https://api.dimu.org/doc/public_api.html ; https://github.com/nasjonalmuseet/DiMu-API-documentation | P1 | Nordic museum aggregator API | Objects, costumes, tools, folk craft, jewelry, furniture, material culture | XML/JSON API; API key required; object and media retrieval | Mixed across institutions | Normalize institution/source museum carefully. |
| `hathitrust` | **HathiTrust**<br><br>URLs: https://www.hathitrust.org/member-libraries/resources-for-librarians/data-resources/ ; https://www.hathitrust.org/member-libraries/resources-for-librarians/data-resources/bibliographic-api/ ; https://old.www.hathitrust.org/data_api.html | P2 | Digital library APIs | Books/catalogues: jewelry, ornament, decorative arts, craft, metalwork | Bibliographic API is lookup not keyword search; Data API may require OAuth; bulk Hathifiles | Complex rights/access by jurisdiction and volume | Use for bibliographic resolution; not first image scraper. |
| `lacma` | **LACMA**<br><br>URLs: https://collections.lacma.org/ ; https://publicdomainreview.org/collections/source/los-angeles-county-museum-of-art/ | P2 | Museum collection site; API unclear | Asian art, ancient objects, decorative arts, costume/textiles, jewelry, prints | Searchable online collection; no clean current public API confirmed | Mixed; PD downloads possible for some records | Research network endpoints; use aggregators in the meantime. |
| `philadelphia_museum_art` | **Philadelphia Museum of Art**<br><br>URLs: https://www.philamuseum.org/collection ; https://publicdomainreview.org/collections/source/philadelphia-museum-of-art/ | P2 | Museum collection site; API unclear | Jewelry, miniatures, decorative arts, Indian/South Asian material, works on paper | Online collection; no clean official public API confirmed | Mixed | Very relevant for jewelry; research JSON endpoints. |
| `brooklyn_museum` | **Brooklyn Museum**<br><br>URLs: https://www.brooklynmuseum.org/opencollection ; https://www.brooklynmuseum.org/image-services ; https://www.brooklynmuseum.org/terms | P2 | Historic API / collection site | Egyptian, Asian, African, decorative arts, costume, jewelry | Historic API existed; current status needs verification | Mixed/restrictive; parse rights carefully | Research current endpoint before coding. |
| `british_library` | **British Library**<br><br>URLs: https://www.bl.uk/catalogues-and-collections/digital-collections ; https://www.imagesonline.bl.uk/ ; https://www.flickr.com/photos/britishlibrary/ | P2 | National library / multiple systems | Manuscripts, books, maps, decorative initials, diagrams, book illustration | No single universal API; collection-specific; many images via Flickr Commons/Wikimedia/IA | Mixed; Images Online commercial; Flickr Commons no known restrictions | Research/manual at first. Use IA/Flickr/Wikimedia routes. |
| `smithsonian_libraries_archives` | **Smithsonian Libraries and Archives**<br><br>URLs: https://library.si.edu/ ; https://www.si.edu/openaccess | P2/P1 | Library/archive; overlaps Smithsonian OA | Books, catalogues, design history, natural history, trade literature, decorative plates | Prefer Smithsonian Open Access API; some books via IA/BHL | CC0 where Smithsonian OA; otherwise mixed | Subsource mapping inside Smithsonian adapter rather than separate adapter unless needed. |
| `nlm_digital_collections` | **US National Library of Medicine**<br><br>URLs: https://collections.nlm.nih.gov/ ; https://catalog.data.gov/dataset/nlm-digital-collections-e330a/resource/23544db8-3847-44f1-a35e-b27b902f5d5c | P2/P1 | Digital collections web service | Anatomy, medicine, body, scientific diagrams, public-health imagery | Search-based web service exposing Dublin Core metadata and links; endpoint details to verify | Mixed | Research endpoint first; strong for anatomy/body references. |
| `slub_dresden` | **SLUB Dresden**<br><br>URLs: https://digital.slub-dresden.de/en/digital-collections | P2 | Digital library | Technical books, geometry, architecture, scientific diagrams, maps, historical books | Searchable digital collection; API/IIIF/OAI to verify | Mixed | Create research issue for IIIF/OAI endpoints. |
| `polona` | **Polona / National Library of Poland**<br><br>URLs: https://polona2.pl/page/about-polona ; https://polona.pl/api/pdn-catalogue/swagger-ui/index.html?configUrl=%2Fapi%2Fpdn-catalogue%2Fapi-docs%2Fswagger-config | P2/P1 | National library API / digital collection | Prints, book illustration, posters, typography, Central/Eastern European material | Swagger/OpenAPI catalogue endpoint; likely JSON REST | Mostly public-domain according to site, but parse per item | More promising than expected; implement after core sources. |
| `us_nal` | **US National Agricultural Library**<br><br>URLs: https://www.nal.usda.gov/all-collections ; https://www.nal.usda.gov/ ; https://publicdomainreview.org/collections/source/us-national-agricultural-library/ | P2 | Agricultural library / digital collections | Botanical/agricultural plates, seed catalogues, nursery catalogues, natural forms | Searchable digital collections; additional full-text via NAL Internet Archive collection; API not verified | Mixed | Use Internet Archive collection first; direct NAL later. |
| `public_domain_review` | **The Public Domain Review**<br><br>URLs: https://publicdomainreview.org/ ; https://publicdomainreview.org/sources/ | P2 discovery | Curated editorial source / source index | Curated discovery of unusual public-domain material and original source institutions | No official API found for PDR; sources page is useful as manual/provider-priority map | PDR editorial content != underlying PD works | Use only to map source backlog; resolve to original institutions. |
| `pdia` | **Public Domain Image Archive**<br><br>URLs: https://pdimagearchive.org/ ; https://pdimagearchive.org/about/ ; https://pdimagearchive.org/sources/ ; https://pdimagearchive.org/terms-and-conditions/ ; https://raw.githubusercontent.com/searxng/searxng/master/searx/engines/public_domain_image_archive.py | P2 discovery only | Curated image archive by PDR; unofficial internal JSON search exists | Visually curated discovery, tags/themes/styles/colors, hand-picked public-domain images | No official API. SearXNG extracts an internal Astro JS search-proxy URL and POSTs JSON with indexName='prod_all-images', query, page, hitsPerPage | Images generally PD/out-of-copyright guidance, but metadata CC BY-NC 4.0; ToS prohibits automated access/systematic scraping | Do not implement production scraper without permission. Use as manual/discovery layer or permission-based low-rate adapter. |

---

# Issue template

```md
## Source
Provider:
Provider ID:
Priority:

## Why relevant
<Asian art / jewelry / ornament / books / morphology / design / etc.>

## Access
- API/docs:
- Search endpoint:
- Record endpoint:
- Image/IIIF endpoint:
- Auth:
- Rate limits:
- Pagination:

## Rights
- Public-domain filter:
- License field:
- Attribution required:
- Commercial-use confidence:
- Notes:

## Implementation tasks
- [ ] create provider adapter
- [ ] implement keyword search
- [ ] implement public-domain / open-access filter
- [ ] implement image-present filter
- [ ] implement fetch-by-id
- [ ] normalize metadata
- [ ] normalize image URLs / IIIF URLs
- [ ] normalize rights
- [ ] add tests for query examples
- [ ] add fixture JSON/XML
- [ ] add sample seed queries

## Acceptance criteria
- Returns at least 20 image-bearing records for a broad query where available.
- Stores exact source URL and rights/license label.
- Does not ingest images where commercial reuse is unclear unless marked as `rights_mixed`.
```

---

# Special note: PDIA / Public Domain Image Archive

PDIA is useful but should be handled carefully.

- No official public API was found.
- SearXNG currently implements an unofficial search engine by:
  1. requesting `https://pdimagearchive.org/search/?q=`
  2. finding an Astro JS file under `/_astro/InfiniteSearch.<hash>.js`
  3. extracting a dynamic internal API URL from the JS
  4. POSTing JSON with `indexName: "prod_all-images"`, `query`, `page`, and `hitsPerPage`
- This proves programmatic search is technically possible.
- It does **not** mean it is allowed for this project.
- PDIA Terms prohibit automated/non-human access and systematic retrieval/scraping unless permission is granted.
- Metadata, excluding images, is CC BY-NC 4.0.
- Therefore mark PDIA as **discovery-only** unless PDR/PDIA grants written permission.

Preferred PDIA workflow:
1. Use PDIA manually or with permission as a curated discovery layer.
2. Store the PDIA page URL only as a lead.
3. Resolve the image to its original source institution.
4. Ingest the canonical record from the original institution when possible.

---

# Minimal first GitHub issues to create

1. `Provider: Met Collection API adapter`
2. `Provider: Cleveland Museum of Art adapter`
3. `Provider: Art Institute of Chicago adapter`
4. `Provider: Smithsonian Open Access adapter`
5. `Provider: V&A Collections API adapter`
6. `Provider: Rijksmuseum Data Services adapter`
7. `Provider: NYPL Digital Collections adapter`
8. `Provider: Internet Archive adapter`
9. `Provider: BHL adapter`
10. `Discovery only: PDIA/PDR source mapping and ToS review`
