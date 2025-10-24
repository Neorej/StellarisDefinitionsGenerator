class CivicsBuilder {
    build(civicsFile = {}, filterFn = null) {
        const defs = {};
        for (const [civicName, civicData] of Object.entries(civicsFile)) {
            // Skip civics that require NOT having a DLC (since generator assumes all DLC)
            if (this._requiresNoDLC(civicData)) {
                continue;
            }
            
            // Apply filter if provided
            if (filterFn && !filterFn(civicName, civicData)) {
                continue; // Skip this civic
            }
            
            const yes = { authorities: [], civics: [], ethics: [], species_archetype: [], culture: [] };
            const no  = { authorities: [], civics: [], ethics: [], species_archetype: [], culture: [] };

            if (civicData.potential) this._extractReqs(civicData.potential, yes, no);
            if (civicData.possible) {
                // possible can be a single object or an array of objects (when there are multiple possible blocks)
                if (Array.isArray(civicData.possible)) {
                    for (const possibleBlock of civicData.possible) {
                        this._extractReqs(possibleBlock, yes, no);
                    }
                } else {
                    this._extractReqs(civicData.possible, yes, no);
                }
            }

            // dedupe small arrays
            yes.authorities = [...new Set(yes.authorities)];
            no.authorities  = [...new Set(no.authorities)];
            yes.civics       = [...new Set(yes.civics)];
            no.civics        = [...new Set(no.civics)];
            yes.ethics       = [...new Set(yes.ethics)];
            no.ethics        = [...new Set(no.ethics)];
            yes.species_archetype = [...new Set(yes.species_archetype)];
            no.species_archetype  = [...new Set(no.species_archetype)];
            yes.culture = [...new Set(yes.culture)];
            no.culture  = [...new Set(no.culture)];

            defs[civicName] = { yes, no };
        }
        
        // Make civic incompatibilities bidirectional
        this._makeBidirectional(defs);
        
        return defs;
    }
    
    _makeBidirectional(defs) {
        // Build a map of all civic incompatibilities
        const incompatibilities = new Map();
        
        // First pass: collect all incompatibilities
        for (const [civicName, civicData] of Object.entries(defs)) {
            if (!incompatibilities.has(civicName)) {
                incompatibilities.set(civicName, new Set());
            }
            
            // For each civic this one forbids
            for (const forbiddenCivic of civicData.no.civics) {
                // Add to this civic's incompatibility list
                incompatibilities.get(civicName).add(forbiddenCivic);
                
                // Also add the reverse: forbiddenCivic should forbid civicName
                if (!incompatibilities.has(forbiddenCivic)) {
                    incompatibilities.set(forbiddenCivic, new Set());
                }
                incompatibilities.get(forbiddenCivic).add(civicName);
            }
        }
        
        // Second pass: apply the bidirectional incompatibilities back to definitions
        for (const [civicName, civicData] of Object.entries(defs)) {
            if (incompatibilities.has(civicName)) {
                civicData.no.civics = Array.from(incompatibilities.get(civicName)).sort();
            }
        }
    }

    _extractReqs(node, yes, no) {
        for (const [key, val] of Object.entries(node)) {
            // Handle cases where the parser created an array due to duplicate keys
            // (e.g., multiple species_archetype blocks in the same possible section)
            const values = Array.isArray(val) && typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0]) 
                ? val 
                : [val];
            
            for (const v of values) {
                if (key === 'ethics') this._handle(v, yes.ethics, no.ethics);
                else if (key === 'authority' || key === 'authorities') this._handle(v, yes.authorities, no.authorities);
                else if (key === 'civics') this._handle(v, yes.civics, no.civics);
                else if (key === 'species_archetype' || key === 'species_archetypes') this._handle(v, yes.species_archetype, no.species_archetype);
                else if (key === 'species_class') this._handle(v, yes.species_archetype, no.species_archetype); // Civics also use species_class
                else if (key === 'graphical_culture') this._handleCulture(v, yes.culture, no.culture);
            }
        }
    }

    _handle(block, yesArr, noArr) {
        if (!block) return;

        // OR means "one of these is required"
        if (Array.isArray(block.OR)) {
            // multiple OR blocks
            for (const orGroup of block.OR) {
                const group = this._gather(orGroup);
                if (group.length) yesArr.push(group);
            }
        } else if (block.OR) {
            // single OR block
            const group = this._gather(block.OR);
            if (group.length) yesArr.push(group);
        }

        // NOR and NOT mean "none of these allowed"
        if (block.NOR) noArr.push(...this._gather(block.NOR));
        if (block.NOT) noArr.push(...this._gather(block.NOT));

        // Single value requirement
        if (block.value) {
            const vals = this._gather(block.value);
            for (const v of vals) yesArr.push(v);
        }
    }


    _handleCulture(block, yesArr, noArr) {
        if (!block) return;

        // OR means "one of these is required"
        if (Array.isArray(block.OR)) {
            // multiple OR blocks
            for (const orGroup of block.OR) {
                const cultures = this._gather(orGroup);
                yesArr.push(...cultures);
            }
        } else if (block.OR) {
            // single OR block
            const cultures = this._gather(block.OR);
            yesArr.push(...cultures);
        }

        // NOR and NOT mean "none of these allowed"
        if (block.NOR) noArr.push(...this._gather(block.NOR));
        if (block.NOT) noArr.push(...this._gather(block.NOT));

        // Single value requirement
        if (block.value) {
            const cultures = this._gather(block.value);
            yesArr.push(...cultures);
        }
    }

    _requiresNoDLC(civicData) {
        // Check if the civic has a playable block that requires NOT having a DLC
        if (!civicData.playable) {
            return false; // No playable block means it's fine
        }

        const playable = civicData.playable;

        // Check for NOT block containing host_has_dlc
        if (playable.NOT) {
            // NOT can be an object or array of objects
            const notBlocks = Array.isArray(playable.NOT) ? playable.NOT : [playable.NOT];
            
            for (const notBlock of notBlocks) {
                if (typeof notBlock === 'object' && notBlock.host_has_dlc) {
                    // This civic requires NOT having a DLC, so we skip it
                    return true;
                }
            }
        }

        return false;
    }

    _gather(x) {
        const out = [];
        if (x == null) return out;
        if (typeof x === 'string') return [x];
        if (Array.isArray(x)) return x.flatMap(v => this._gather(v));
        if (typeof x === 'object') {
            if ('value' in x) return this._gather(x.value);
            return Object.values(x).flatMap(v => this._gather(v));
        }
        return out;
    }
}
