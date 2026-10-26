# Link audit and relink

**When:** pages carry broken or legacy links (old host, removed pages).

**Reference project:** 165 articles audited (190 broken, 251 legacy links); 177 broken links on 74 pages relinked
or removed from an answer sheet; 285 links to a retired department unlinked.

**Steps**
1. A read-only operation (or `export`) lists every link per page: field, text, target, and a verdict (internal ok,
   internal missing, external 404, legacy host).
2. The content team fills an answer sheet: new internal page, new URL, or remove.
3. A project operation turns answers into `update` change sets; `transform` covers simple cases (unwrap anchors,
   rewrite hrefs by pattern).

**Pitfalls**
- Links inside rich text use `~/link.aspx?_id=<id>`; general links use `id="{...}"` or `url=`; handle both.
- Removing a link keeps its text unless the answer says remove the sentence.
