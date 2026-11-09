export interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  text: string
}

function isSpace(c: string): boolean {
  return c === ' ' || c === '\n' || c === '\t' || c === '\r'
}

function stripNs(name: string): string {
  const idx = name.indexOf(':')
  return idx >= 0 ? name.slice(idx + 1) : name
}

function decodeEntities(s: string): string {
  if (s.indexOf('&') === -1) return s
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')
}

/**
 * 极简 XML 解析：只处理 3MF 需要的子集（元素、属性、文本、注释、CDATA）。
 * 不追求完整 XML 规范，但足以安全地遍历 3D/3dmodel.model。
 */
export function parseXml(src: string): XmlNode | null {
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' }
  const stack: XmlNode[] = [root]
  let i = 0
  const n = src.length
  // 防御：无论如何本轮迭代都会推进；此计数仅作为最后一道保险，
  // 避免任何畸形结构把主进程锁死在同步循环里。
  let guard = 0
  const guardLimit = n * 2 + 4096

  while (i < n) {
    if (++guard > guardLimit) break
    const lt = src.indexOf('<', i)
    if (lt === -1) {
      stack[stack.length - 1].text += decodeEntities(src.slice(i))
      break
    }
    if (lt > i) {
      const chunk = src.slice(i, lt)
      if (chunk.trim().length > 0) stack[stack.length - 1].text += decodeEntities(chunk)
    }
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4)
      i = end === -1 ? n : end + 3
      continue
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9)
      const val = src.slice(lt + 9, end === -1 ? n : end)
      stack[stack.length - 1].text += val
      i = end === -1 ? n : end + 3
      continue
    }
    const next = src[lt + 1]
    if (next === '?') {
      const end = src.indexOf('?>', lt + 2)
      i = end === -1 ? n : end + 2
      continue
    }
    if (next === '!') {
      const end = src.indexOf('>', lt + 2)
      i = end === -1 ? n : end + 1
      continue
    }
    if (next === '/') {
      const end = src.indexOf('>', lt + 2)
      if (stack.length > 1) stack.pop()
      i = end === -1 ? n : end + 1
      continue
    }

    let j = lt + 1
    while (j < n && !isSpace(src[j]) && src[j] !== '/' && src[j] !== '>') j++
    const node: XmlNode = {
      name: stripNs(src.slice(lt + 1, j)),
      attrs: {},
      children: [],
      text: ''
    }
    let selfClosing = false
    while (j < n) {
      const before = j
      while (j < n && isSpace(src[j])) j++
      if (j >= n) break
      if (src[j] === '>') {
        j++
        break
      }
      if (src[j] === '/' && src[j + 1] === '>') {
        selfClosing = true
        j += 2
        break
      }
      let k = j
      while (k < n && !isSpace(src[k]) && src[k] !== '=' && src[k] !== '>' && src[k] !== '/') k++
      const attrName = stripNs(src.slice(j, k))
      if (attrName.length === 0) {
        // 非法字符（例如 `/` 后不跟 `>`，或孤立的 `=`）：跳过当前位，
        // 保证属性循环一定向前推进，绝不原地打转。
        j = before + 1
        continue
      }
      j = k
      while (j < n && isSpace(src[j])) j++
      if (j < n && src[j] === '=') {
        j++
        while (j < n && isSpace(src[j])) j++
        const quote = src[j]
        if (quote === '"' || quote === "'") {
          const end = src.indexOf(quote, j + 1)
          if (end === -1) {
            node.attrs[attrName] = decodeEntities(src.slice(j + 1))
            j = n
            break
          }
          node.attrs[attrName] = decodeEntities(src.slice(j + 1, end))
          j = end + 1
        } else {
          let k2 = j
          while (k2 < n && !isSpace(src[k2]) && src[k2] !== '>' && src[k2] !== '/') k2++
          node.attrs[attrName] = src.slice(j, k2)
          j = k2
        }
      } else {
        node.attrs[attrName] = ''
      }
      if (j <= before) j = before + 1
    }
    stack[stack.length - 1].children.push(node)
    if (!selfClosing) stack.push(node)
    i = j
  }

  return root.children[0] ?? null
}

export function childText(node: XmlNode, childName: string): string | null {
  const c = node.children.find((x) => x.name === childName)
  return c ? c.text.trim() : null
}

export function firstChild(node: XmlNode, childName: string): XmlNode | null {
  return node.children.find((x) => x.name === childName) ?? null
}

export function allChildren(node: XmlNode, childName: string): XmlNode[] {
  return node.children.filter((x) => x.name === childName)
}
