/** BibTeX / RIS citation helpers for library metadata. */

export type CiteFormat = 'bibtex' | 'ris'

export type CiteFields = {
  upload_id?: string | null
  filename?: string | null
  title?: string | null
  authors?: string[] | null
  year?: number | null
  doi?: string | null
  abstract?: string | null
  venue?: string | null
  venue_type?: string | null
  arxiv_id?: string | null
}

function authorsList(fields: CiteFields): string[] {
  return (fields.authors || []).map((a) => a.trim()).filter(Boolean)
}

function displayTitle(fields: CiteFields): string {
  const t = (fields.title || '').trim()
  if (t) return t
  let fb = (fields.filename || 'Untitled').trim()
  if (fb.toLowerCase().endsWith('.pdf')) fb = fb.slice(0, -4)
  return fb || 'Untitled'
}

function citeKey(fields: CiteFields, title: string): string {
  const authors = authorsList(fields)
  const yearS = fields.year != null ? String(fields.year) : 'nd'
  let last = 'ref'
  if (authors.length) {
    const first = authors[0]
    if (first.includes(',')) last = first.split(',')[0].trim()
    else {
      const parts = first.split(/\s+/).filter(Boolean)
      last = parts[parts.length - 1] || first
    }
    last = last.replace(/[^A-Za-z0-9]/g, '') || 'ref'
  }
  const slug = title.replace(/[^A-Za-z0-9]+/g, '').slice(0, 12) || 'paper'
  const uid = (fields.upload_id || '').slice(0, 8)
  return uid ? `${last}${yearS}${slug}_${uid}` : `${last}${yearS}${slug}`
}

function entryType(fields: CiteFields): string {
  const vt = (fields.venue_type || '').trim().toLowerCase()
  if (vt === 'conference') return 'inproceedings'
  if (vt === 'journal') return 'article'
  if (vt === 'preprint' || fields.arxiv_id) return 'misc'
  if (fields.venue) return 'article'
  return 'misc'
}

function bibEscape(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
}

export function toBibTeX(fields: CiteFields): string {
  const title = displayTitle(fields)
  const key = citeKey(fields, title)
  const etype = entryType(fields)
  const authors = authorsList(fields)
  const lines: string[] = [`@${etype}{${key},`]
  lines.push(`  title = {${bibEscape(title)}},`)
  if (authors.length) {
    lines.push(`  author = {${bibEscape(authors.join(' and '))}},`)
  }
  if (fields.year != null) lines.push(`  year = {${fields.year}},`)
  const venue = (fields.venue || '').trim()
  if (venue) {
    if (etype === 'inproceedings') {
      lines.push(`  booktitle = {${bibEscape(venue)}},`)
    } else if (etype === 'misc') {
      lines.push(`  howpublished = {${bibEscape(venue)}},`)
    } else {
      lines.push(`  journal = {${bibEscape(venue)}},`)
    }
  }
  const doi = (fields.doi || '').trim()
  if (doi) lines.push(`  doi = {${bibEscape(doi)}},`)
  const arxivId = (fields.arxiv_id || '').trim()
  if (arxivId) {
    lines.push(`  eprint = {${bibEscape(arxivId)}},`)
    lines.push('  archivePrefix = {arXiv},')
    lines.push(`  url = {https://arxiv.org/abs/${bibEscape(arxivId)}},`)
  } else if (doi) {
    lines.push(`  url = {https://doi.org/${bibEscape(doi)}},`)
  }
  const abstract = (fields.abstract || '').trim()
  if (abstract) {
    const ab = abstract.length <= 1200 ? abstract : `${abstract.slice(0, 1197)}...`
    lines.push(`  abstract = {${bibEscape(ab)}},`)
  }
  if (lines.length > 1 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1)
  }
  lines.push('}')
  return `${lines.join('\n')}\n`
}

function risType(fields: CiteFields): string {
  const vt = (fields.venue_type || '').trim().toLowerCase()
  if (vt === 'conference') return 'CONF'
  if (vt === 'journal') return 'JOUR'
  if (vt === 'preprint' || fields.arxiv_id) return 'ELEC'
  if (fields.venue) return 'JOUR'
  return 'GEN'
}

export function toRIS(fields: CiteFields): string {
  const title = displayTitle(fields)
  const ty = risType(fields)
  const rows: string[] = [`TY  - ${ty}`, `TI  - ${title}`]
  for (const a of authorsList(fields)) rows.push(`AU  - ${a}`)
  if (fields.year != null) rows.push(`PY  - ${fields.year}`)
  const venue = (fields.venue || '').trim()
  if (venue) rows.push(ty === 'CONF' ? `T2  - ${venue}` : `JO  - ${venue}`)
  const doi = (fields.doi || '').trim()
  if (doi) {
    rows.push(`DO  - ${doi}`)
    rows.push(`UR  - https://doi.org/${doi}`)
  }
  const arxivId = (fields.arxiv_id || '').trim()
  if (arxivId) rows.push(`UR  - https://arxiv.org/abs/${arxivId}`)
  const abstract = (fields.abstract || '').trim()
  if (abstract) rows.push(`AB  - ${abstract}`)
  rows.push('ER  - ')
  return `${rows.join('\n')}\n`
}

export function formatCitation(fields: CiteFields, format: CiteFormat): string {
  return format === 'ris' ? toRIS(fields) : toBibTeX(fields)
}

export function formatCitations(items: CiteFields[], format: CiteFormat): string {
  return items.map((f) => formatCitation(f, format)).join('\n')
}

export function downloadCitationFile(
  text: string,
  format: CiteFormat,
  basename = 'citations',
): void {
  const ext = format === 'ris' ? 'ris' : 'bib'
  const mime = format === 'ris' ? 'application/x-research-info-systems' : 'application/x-bibtex'
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${basename}.${ext}`
  a.click()
  URL.revokeObjectURL(url)
}

export async function copyCitationText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
