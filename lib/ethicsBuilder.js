class EthicsBuilder {
    constructor() {
        // static opposites map
        this.opposites = {
            ethic_authoritarian: 'ethic_egalitarian',
            ethic_egalitarian  : 'ethic_authoritarian',
            ethic_xenophobe    : 'ethic_xenophile',
            ethic_xenophile    : 'ethic_xenophobe',
            ethic_militarist   : 'ethic_pacifist',
            ethic_pacifist     : 'ethic_militarist',
            ethic_spiritualist : 'ethic_materialist',
            ethic_materialist  : 'ethic_spiritualist',
        };
    }

    build(ethicsFile = {}, authoritiesFile = {}) {
        const defs = {};

        for (const [ethicName, ethicData] of Object.entries(ethicsFile)) {
            // skip gestalt
            if (ethicName === 'ethic_gestalt_consciousness') continue;

            const cost = this._toNumberOrDefault(ethicData?.cost, 1);

            const allowedAuthorities = [];
            for (const [authName, authData] of Object.entries(authoritiesFile)) {
                const ethicsNode = authData?.possible?.ethics;
                if (!ethicsNode) continue; // skip "always valid" authorities

                const {orList, norList} = this._extractOrNor(ethicsNode);
                if (norList.includes(ethicName)) continue;
                if (orList.length > 0 && !orList.includes(ethicName)) continue;

                allowedAuthorities.push(authName);
            }

            // build incompatibilities
            const incompatible = new Set();

            // regular <-> fanatic
            if (ethicName.startsWith('ethic_fanatic_')) {
                const base = ethicName.replace('ethic_fanatic_', '');
                incompatible.add('ethic_' + base);
            } else {
                const base = ethicName.replace('ethic_', '');
                incompatible.add('ethic_fanatic_' + base);
            }

            // opposites
            const baseName = ethicName.startsWith('ethic_fanatic_')
                ? ethicName.replace('ethic_fanatic_', 'ethic_')
                : ethicName;

            const opposite = this.opposites[baseName];
            if (opposite) {
                incompatible.add(opposite);
                incompatible.add('ethic_fanatic_' + opposite.replace('ethic_', ''));
            }

            defs[ethicName] = {
                cost,
                incompatible_ethics : Array.from(incompatible),
                required_authorities: allowedAuthorities,
            };
        }

        return defs;
    }

    _extractOrNor(node) {
        if (!node) return {orList: [], norList: []};
        const orList  = this._gather(node.OR ?? node.Or ?? node.or ?? null);
        const norList = this._gather(node.NOR ?? node.Nor ?? node.nor ?? null);
        if (orList.length === 0 && norList.length === 0) {
            const direct = this._gather(node);
            return {orList: direct, norList: []};
        }
        return {orList, norList};
    }

    _gather(x) {
        const out = [];
        if (x == null) return out;
        if (typeof x === 'string') return [x];
        if (typeof x === 'number') return [String(x)];
        if (Array.isArray(x)) {
            for (const v of x) out.push(...this._gather(v));
            return out;
        }
        if (typeof x === 'object') {
            if ('value' in x) return this._gather(x.value);
            for (const v of Object.values(x)) out.push(...this._gather(v));
            return out;
        }
        return out;
    }

    _toNumberOrDefault(v, def) {
        if (typeof v === 'number') return v;
        if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
        return def;
    }
}
