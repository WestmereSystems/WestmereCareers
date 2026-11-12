# Visual assets and licences

Westmere Careers uses original vector artwork and self-hosted open-licensed fonts. No stock-photo subscription, remote illustration dependency, trademarked employer logo, or attribution-required illustration is included.

## Original illustrations — CC0 1.0

The following original SVG illustrations were created specifically for this project on 12 November 2026:

- `public/illustrations/career-path.svg` — a hopeful landscape, ascending steps, doorway, plants and rising sun.
- `public/illustrations/growing-together.svg` — a growing plant beside small steps.
- `public/illustrations/new-chapter.svg` — an open notebook and leafy bookmark.

To the extent rights exist in these original illustrations and can be dedicated, the contributor waives copyright and related rights under the [CC0 1.0 Universal Public Domain Dedication](https://creativecommons.org/publicdomain/zero/1.0/). They may be used, changed and redistributed commercially without attribution. This dedication covers these illustration files, not the Westmere brand name, website source, fonts, third-party icons or fictional employer names.

The artwork contains no third-party photographs or copied character/brand designs. Each SVG includes a title, description and licence metadata. Render decorative instances with an empty image alternative where the surrounding copy already conveys the meaning.

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
