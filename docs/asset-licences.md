# Visual assets and licences

Westmere Careers uses original vector artwork and self-hosted open-licensed fonts. No stock-photo subscription, remote illustration dependency, trademarked employer logo, or attribution-required illustration is included.

## Original illustrations — CC0 1.0

The following original SVG illustrations were created specifically for this project on 12 November 2026:

- `public/illustrations/career-path.svg` — a hopeful landscape, ascending steps, doorway, plants and rising sun.
- `public/illustrations/growing-together.svg` — a growing plant beside small steps.
- `public/illustrations/new-chapter.svg` — an open notebook and leafy bookmark.

The following additional original, code-native SVG illustrations were created specifically for this project on 15 November 2026:

- `public/illustrations/premium-career-studio.svg` — a flowing purple ribbon, softly shaded globe, application sheet and growing leaves for Careers+.
- `public/illustrations/opportunity-orbit.svg` — a sage globe with an open doorway and winding path, surrounded by a notebook, opportunity envelope and briefcase.

To the extent rights exist in these original illustrations and can be dedicated, the contributor waives copyright and related rights under the [CC0 1.0 Universal Public Domain Dedication](https://creativecommons.org/publicdomain/zero/1.0/). They may be used, changed and redistributed commercially without attribution. This dedication covers these illustration files, not the Westmere brand name, website source, fonts, third-party icons or fictional employer names.

The artwork contains no third-party photographs or copied character/brand designs. Each SVG includes a title, description and licence metadata. The two November 15 illustrations are original vector geometry, not stock assets, and contain no external resources, scripts, fonts or embedded raster images. Their CC0 dedication is the same as the original illustrations above. Render decorative instances with an empty image alternative where the surrounding copy already conveys the meaning.

## Fonts — SIL Open Font License 1.1

The fonts are open licensed, rather than copyright-free. Commercial self-hosting is permitted subject to the included licences:

| Font                                           | Local production asset       | Notice                         | Source                                                                       |
| ---------------------------------------------- | ---------------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| Manrope, variable normal 400–800, Latin subset | `public/fonts/manrope.woff2` | `public/fonts/Manrope-OFL.txt` | [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/manrope) |
| DM Sans, variable normal 400–700, Latin subset | `public/fonts/dm-sans.woff2` | `public/fonts/DM-Sans-OFL.txt` | [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/dmsans)  |

The unmodified WOFF2 subsets were downloaded from the Google Fonts stylesheet on 12 November 2026. No browser request to Google Fonts is necessary once these files are served locally. Their respective OFL notices are preserved as text files. Latin-only typography falls back to the system sans-serif for characters outside the subset.

## UI icons

The site uses the `lucide-react` dependency. Its full ISC licence and the MIT notices for icons derived from Feather are preserved in `public/illustrations/Lucide-LICENSE.txt`, so the notices are included in the deployed public assets as well as in the installed dependency. This is an open-source icon licence, not a public-domain claim. The dependency must remain in the project's third-party licence inventory.

## Demo content

All employers, vacancies, salaries, response counts and response times in `src/lib/jobs.ts` are fictional fixtures. They are marked as demo data in the UI and must not be imported as genuine public job listings, employer endorsements or market salary research.

## Real-human photography — CC0 1.0

Two self-hosted photographs were downloaded and visually reviewed on 15 November 2026. Each individual Nappy source page explicitly identifies the photograph as **public domain**. The publisher's [Nappy licence page](https://nappy.co/license) states that its photographs are released under [Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/), including commercial use and modification without required attribution. These are the actual listed photo assets, not the separately advertised iStock images on those pages.

| Production asset                                                     | Photograph and credited contributor                                                                                               | Primary source                                                                                                           | Downloaded source image                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `public/images/creative-colleagues.webp` — 1,260 × 709, 59,016 bytes | “Two Black Woman with white clothes”, **thirdandwonder**; two creative-production colleagues preparing together behind the scenes | [Individual public-domain photo page](https://nappy.co/photo/two-black-woman-with-white-clothes%2Besl0dKo3oxKSVeQj58q_o) | [Nappy image](https://images.nappy.co/photo/esl0dKo3oxKSVeQj58q_o.jpg?width=1260) |
| `public/images/focused-work.webp` — 1,260 × 840, 50,566 bytes        | “Work”, **NappyStock**; a person working on a laptop beside a window                                                              | [Individual public-domain photo page](https://nappy.co/photo/work%2BzGrbhlx8mgBqyAaItdwny)                               | [Nappy image](https://images.nappy.co/photo/zGrbhlx8mgBqyAaItdwny.jpg?width=1260) |

Changes: JPEG sources were converted to WebP at quality 80 for local delivery, with metadata removed. The composition and depicted people were not altered. No request to Nappy is needed when the site displays these files.

Use these as illustrative photographs of people and work. The subjects are not represented as Westmere employees, customers, job applicants, testimonial authors, or endorsers. Their nationality, job-search circumstances and relationship to Westmere are unknown; do not invent those details or use the images as evidence of Australian customers. CC0 addresses copyright; it does not create a subject's endorsement or transfer personality/privacy/trademark rights. No independent model-release document was supplied with these downloads. Nappy asks that its images not be used to insult or degrade the people pictured, resold unchanged, or reposted to another stock-photo service.

## Australia silhouette — public-domain Natural Earth geography

`public/icons/australia.svg` is a 24-unit, `currentColor` silhouette derived from the **Australia (`ADM0_A3 = AUS`)** feature in Natural Earth **v5.1.2, 1:110m Admin 0 – Countries**. It retains mainland Australia and Tasmania as two separate paths. It is a geographic icon, not a flag or a claim to government affiliation.

- [Exact versioned source GeoJSON](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_110m_admin_0_countries.geojson), downloaded 15 November 2026.
- Download SHA-256: `6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f`.
- [Natural Earth terms of use](https://www.naturalearthdata.com/about/terms-of-use/) declare all versions of its vector/raster data **public domain**, permit commercial use and modification, and require no attribution. The geography is not covered by the Lucide icon licence or described as an original guessed outline.
- Changes: longitude was scaled by `cos(27°)`, latitude inverted for SVG coordinates, both polygons uniformly fitted to a 24 × 24 viewbox with margins, and coastlines simplified at a 0.08-unit tolerance. Geographic islands absent from this small-scale source have not been invented. The result was rendered and visually checked with Tasmania preserved, and includes source/licence metadata without scripts or remote resources.

The Westmere email wordmark SVG and rendered PNG are original Westmere artwork, dedicated to CC0 alongside the original illustration set. The React Australia icon uses the same documented Natural Earth geometry as `public/icons/australia.svg`.

## November 15 visual refresh

`public/images/australian-wildlife-worker.webp` is an original AI-generated illustrative workplace scene produced with the built-in image-generation tool. It depicts a fictional wildlife carer and wallabies; it is not a stock photograph, real employer, customer or testimonial. The homepage labels it illustrative. The exact prompt and processing details are in [visual-refresh.md](visual-refresh.md). Existing Nappy photography and its notices remain unchanged.

`public/illustrations/career-path.svg` and the updated Westmere email SVG/PNG wordmark are original vector artwork, dedicated to CC0 alongside the existing original illustrations. Brand names remain subject to the exclusions above. `scripts/generate-brand-assets.mjs` regenerates the PNG from its source SVG.
