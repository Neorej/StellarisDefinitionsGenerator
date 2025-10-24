class ParadoxParser {
    async parseFile(file) {
        const content = await file.async('text');
        return this.parse(content);
    }

    parse(text) {
        this.text   = (text || '').replace(/\r\n?/g, '\n');
        this.pos    = 0;
        this.tokens = this._tokenize(this._stripComments(this.text));
        this.idx    = 0;
        const out   = {};
        while (this._peek()) {
            const tk = this._peek();
            if (tk.type !== 'word') {
                this._next();
                continue;
            }
            const name = this._next().value;
            const nxt  = this._peek();
            if (nxt && nxt.type === '=') {
                this._next(); // consume '='
                const val = this._parseValue();
                this._assign(out, name, val);
            } else {
                // bare top-level token (rare) - store true
                this._assign(out, name, true);
            }
        }
        return out;
    }

    /* ---------- Lexer / helpers ---------- */

    _stripComments(src) {
        // remove '#' comments but preserve # inside quoted strings
        let out     = '';
        let inQuote = false;
        for (let i = 0; i < src.length; i++) {
            const ch = src[i];
            if (ch === '"') {
                // check escape count
                let j = i - 1, bs = 0;
                while (j >= 0 && src[j] === '\\') {
                    bs++;
                    j--;
                }
                if (bs % 2 === 0) inQuote = !inQuote;
                out += ch;
                continue;
            }
            if (!inQuote && ch === '#') {
                // skip until newline (inclusive of newline)
                while (i < src.length && src[i] !== '\n') i++;
                if (i < src.length) out += '\n';
                continue;
            }
            out += ch;
        }
        return out;
    }

    _tokenize(src) {
        const tokens       = [];
        const isWhitespace = c => /\s/.test(c);
        const specials     = new Set(['{', '}', '=', '>', '<', '!', '"']);
        let i              = 0, L = src.length;
        while (i < L) {
            const ch = src[i];
            if (isWhitespace(ch)) {
                i++;
                continue;
            }
            if (ch === '{') {
                tokens.push({type: '{', value: '{'});
                i++;
                continue;
            }
            if (ch === '}') {
                tokens.push({type: '}', value: '}'});
                i++;
                continue;
            }
            if (ch === '=') {
                tokens.push({type: '=', value: '='});
                i++;
                continue;
            }
            if (ch === '"') {
                // read quoted string, support escaping \" and \\;
                let j = i + 1, str = '';
                while (j < L) {
                    if (src[j] === '"') {
                        // count backslashes before quote
                        let k = j - 1, bs = 0;
                        while (k >= 0 && src[k] === '\\') {
                            bs++;
                            k--;
                        }
                        if (bs % 2 === 0) {
                            j++;
                            break;
                        }
                    }
                    str += src[j++];
                }
                tokens.push({type: 'string', value: str});
                i = j;
                continue;
            }
            if (ch === '>' || ch === '<' || ch === '!') {
                let op = ch;
                if (i + 1 < L && src[i + 1] === '=') {
                    op += '=';
                    i += 2;
                } else {
                    i += 1;
                }
                tokens.push({type: 'op', value: op});
                continue;
            }
            // read a word/number: anything until whitespace or one of { } = > < ! "
            let j = i;
            while (j < L && !isWhitespace(src[j]) && !specials.has(src[j])) j++;
            const word = src.slice(i, j);
            if (/^-?\d+(\.\d+)?$/.test(word)) tokens.push({type: 'number', value: word});
            else tokens.push({type: 'word', value: word});
            i = j;
        }
        return tokens;
    }

    _peek() {
        return this.tokens[this.idx];
    }

    _next() {
        return this.tokens[this.idx++];
    }

    _assign(obj, key, value) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
            obj[key].push(value);
        } else {
            obj[key] = value;
        }
    }

    /* ---------- Parser ---------- */

    _parseValue() {
        const tk = this._peek();
        if (!tk) return null;
        if (tk.type === '{') {
            this._next(); // consume '{'
            return this._parseBlock();
        }
        if (tk.type === 'string') {
            this._next();
            return tk.value;
        }
        if (tk.type === 'number') {
            this._next();
            return Number(tk.value);
        }
        if (tk.type === 'word') {
            const w = tk.value;
            this._next();
            if (w === 'yes') return true;
            if (w === 'no') return false;
            return w;
        }
        if (tk.type === 'op') {
            this._next();
            return tk.value;
        }
        // fallback
        this._next();
        return tk.value;
    }

    _parseBlock() {
        const obj  = {};
        const list = [];
        while (true) {
            const tk = this._peek();
            if (!tk) break; // EOF inside block
            if (tk.type === '}') {
                this._next();
                break;
            } // consume '}'
            if (tk.type === 'word') {
                const name = this._next().value;
                const nxt  = this._peek();
                if (nxt && nxt.type === '=') {
                    this._next(); // consume '='
                    const val = this._parseValue();
                    this._assign(obj, name, val);
                    continue;
                }
                if (nxt && nxt.type === 'op') {
                    const op      = this._next().value; // operator
                    const operand = this._peek();
                    let repr;
                    if (operand) {
                        if (operand.type === 'string') {
                            repr = `${name} ${op} "${operand.value}"`;
                            this._next();
                        } else {
                            repr = `${name} ${op} ${operand.value}`;
                            this._next();
                        }
                    } else repr = `${name} ${op}`;
                    list.push(repr);
                    continue;
                }
                if (nxt && nxt.type === '{') {
                    // non-standard "name { ... }" without '=' ; treat as assignment
                    const val = this._parseValue(); // parseValue will see '{' and parse block
                    this._assign(obj, name, val);
                    continue;
                }
                // bare token -> list item
                list.push(name);
                continue;
            }
            if (tk.type === '{') {
                const val = this._parseValue(); // parse nested anonymous block
                list.push(val);
                continue;
            }
            // other token types: number/string/op - treat as literal list items
            if (tk.type === 'string') {
                list.push(this._next().value);
                continue;
            }
            if (tk.type === 'number') {
                list.push(Number(this._next().value));
                continue;
            }
            // ops or others
            list.push(this._next().value);
        }

        const hasObjProps = Object.keys(obj).length > 0;
        if (!hasObjProps) return list;              // pure list -> return array (e.g. tags)
        if (list.length) obj.items = list;          // mixed block -> keep keyed props and an items array
        return obj;
    }
}
