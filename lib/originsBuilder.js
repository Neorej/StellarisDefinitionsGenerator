class OriginsBuilder {
    build(originsFile = {}, filterFn = null, traitsLookup = null, civicsFiles = []) {
        const defs = {};
        for (const [originName, originData] of Object.entries(originsFile)) {
            // Apply filter if provided
            if (filterFn && !filterFn(originName, originData)) {
                continue; // Skip this origin
            }
            
            const yes = { authorities: [], civics: [], ethics: [], species_class: [], species_archetype: [], culture: [] };
            const no  = { authorities: [], civics: [], ethics: [], species_class: [], species_archetype: [], culture: [] };

            if (originData.potential) {
                // potential can be a single object or an array of objects (when there are multiple potential blocks)
                if (Array.isArray(originData.potential)) {
                    for (const potentialBlock of originData.potential) {
                        this._extractReqs(potentialBlock, yes, no);
                    }
                } else {
                    this._extractReqs(originData.potential, yes, no);
                }
            }
            if (originData.possible) {
                // possible can be a single object or an array of objects (when there are multiple possible blocks)
                if (Array.isArray(originData.possible)) {
                    for (const possibleBlock of originData.possible) {
                        this._extractReqs(possibleBlock, yes, no);
                    }
                } else {
                    this._extractReqs(originData.possible, yes, no);
                }
            }

            // dedupe small arrays
            yes.authorities = [...new Set(yes.authorities)];
            no.authorities  = [...new Set(no.authorities)];
            yes.civics       = [...new Set(yes.civics)];
            no.civics        = [...new Set(no.civics)];
            yes.ethics       = [...new Set(yes.ethics)];
            no.ethics        = [...new Set(no.ethics)];
            yes.species_class = [...new Set(yes.species_class)];
            no.species_class  = [...new Set(no.species_class)];
            yes.species_archetype = [...new Set(yes.species_archetype)];
            no.species_archetype  = [...new Set(no.species_archetype)];
            yes.culture = [...new Set(yes.culture)];
            no.culture  = [...new Set(no.culture)];

            // Check for force-added traits and inherit their requirements
            if (originData.traits && traitsLookup) {
                this._extractTraitRequirements(originData.traits, yes, no, traitsLookup);
            }

            // Flatten single-element OR groups in yes arrays
            this._flattenSingleElementGroups(yes);

            defs[originName] = { yes, no };
        }
        
        // Make origin-civic incompatibilities bidirectional
        // Also scans civic files to find civics that forbid origins
        this._makeBidirectional(defs, civicsFiles);
        
        return defs;
    }
    
    _makeBidirectional(defs, civicsFiles = []) {
        // Build a map of all civic incompatibilities
        const incompatibilities = new Map();
        
        // First pass: collect civic incompatibilities from origins
        for (const [originName, originData] of Object.entries(defs)) {
            if (!incompatibilities.has(originName)) {
                incompatibilities.set(originName, new Set());
            }
            
            // For each civic this origin forbids
            for (const forbiddenCivic of originData.no.civics) {
                incompatibilities.get(originName).add(forbiddenCivic);
            }
        }
        
        // Second pass: scan civic files for origin restrictions
        // This finds civics that forbid origins (e.g., civic_environmental_architects forbids origin_shattered_ring)
        for (const civicsFile of civicsFiles) {
            for (const [civicName, civicData] of Object.entries(civicsFile)) {
                // Extract origin restrictions from this civic
                const forbiddenOrigins = this._extractOriginRestrictions(civicData);

                
                // Add this civic to each forbidden origin's incompatibility list
                for (const originName of forbiddenOrigins) {
                    if (incompatibilities.has(originName)) {
                        incompatibilities.get(originName).add(civicName);
                    }
                }
            }
        }
        
        // Third pass: apply all incompatibilities back to origin definitions
        for (const [originName, originData] of Object.entries(defs)) {
            if (incompatibilities.has(originName)) {
                originData.no.civics = Array.from(incompatibilities.get(originName)).sort();
            }
        }
    }
    
    _extractOriginRestrictions(civicData) {
        const forbiddenOrigins = [];
        
        // Check potential block
        if (civicData.potential && civicData.potential.origin) {
            forbiddenOrigins.push(...this._extractForbiddenValues(civicData.potential.origin));
        }
        
        // Check possible block(s) - can be single object or array
        const possibleBlocks = Array.isArray(civicData.possible) 
            ? civicData.possible 
            : (civicData.possible ? [civicData.possible] : []);
        
        for (const possible of possibleBlocks) {
            if (possible && possible.origin) {
                // Handle case where origin itself might be an array (duplicate keys)
                const originBlocks = Array.isArray(possible.origin) && typeof possible.origin[0] === 'object' && possible.origin[0] !== null && !Array.isArray(possible.origin[0])
                    ? possible.origin
                    : [possible.origin];
                
                for (const originBlock of originBlocks) {
                    forbiddenOrigins.push(...this._extractForbiddenValues(originBlock));
                }
            }
        }
        
        return forbiddenOrigins;
    }
    
    _extractForbiddenValues(block) {
        const forbidden = [];
        if (!block) return forbidden;
        
        // Handle NOT blocks
        if (block.NOT) {
            const notValues = this._gather(block.NOT);
            forbidden.push(...notValues);
        }
        
        // Handle NOR blocks
        // NOR can be a single object or an array of objects (if there are multiple NOR blocks)
        if (block.NOR) {
            const norBlocks = Array.isArray(block.NOR) ? block.NOR : [block.NOR];
            
            for (const norBlock of norBlocks) {
                const norValues = this._gather(norBlock);
                forbidden.push(...norValues);
            }
        }
        
        return forbidden;
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
                else if (key === 'species_class') this._handle(v, yes.species_class, no.species_class);
                else if (key === 'species_archetype') this._handle(v, yes.species_archetype, no.species_archetype);
                else if (key === 'graphical_culture') this._handleCulture(v, yes.culture, no.culture);
            }
        }
    }s

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

    _flattenSingleElementGroups(yes) {
        // Flatten OR groups that contain only one element
        // For example: [["auth_hive_mind"]] becomes ["auth_hive_mind"]
        // But [["auth_hive_mind", "auth_machine_intelligence"]] stays nested (it's an OR group)
        for (const key of Object.keys(yes)) {
            if (Array.isArray(yes[key])) {
                yes[key] = yes[key].map(item => {
                    // If item is an array with only 1 element, flatten it
                    if (Array.isArray(item) && item.length === 1) {
                        return item[0];
                    }
                    // Otherwise keep it as is (either not an array, or array with 2+ elements)
                    return item;
                });
            }
        }
    }

    _extractTraitRequirements(traitsBlock, yes, no, traitsLookup) {
        // Handle traits.trait (can be single value or array)
        const traitIds = this._gather(traitsBlock.trait);
        
        for (const traitId of traitIds) {
            const traitData = traitsLookup[traitId];
            if (!traitData) continue;
            
            // Extract allowed_archetypes from the trait
            if (traitData.allowed_archetypes) {
                const archetypes = Array.isArray(traitData.allowed_archetypes) 
                    ? traitData.allowed_archetypes 
                    : [traitData.allowed_archetypes];
                
                // Add as an OR group (need one of these archetypes)
                yes.species_archetype.push(archetypes);
            }
            
            // Could also handle forbidden_archetypes or other trait properties here if needed in the future
        }
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
