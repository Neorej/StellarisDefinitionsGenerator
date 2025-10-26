/**
 * TraitsBuilder
 * 
 * Converts parsed Stellaris trait definitions into the JSON format needed by the empire generator.
 * Handles different trait types:
 * - Simple traits: just cost and incompatibles (opposites)
 * - Leader traits: cost, yes.class[], yes.ethics[]
 * - Species background traits: simple array lists
 * 
 * For basegame_traits (species traits), the format is:
 * {
 *   'trait_name': {
 *     cost: 2,
 *     no: ['opposite_trait1', 'opposite_trait2']
 *   }
 * }
 * 
 * Key features:
 * - Extracts cost from trait definitions
 * - Processes opposites array for incompatible traits
 * - Implements bidirectional incompatibilities (if A opposes B, then B opposes A)
 */
class TraitsBuilder {
    constructor() {
        // No hardcoded data needed for traits - all extracted from game files
    }

    /**
     * Build trait definitions from parsed data
     * @param {Object} parsedData - Parsed trait definitions from ParadoxParser
     * @param {Function} filterFn - Optional filter function to include/exclude traits
     * @returns {Object} Trait definitions in generator format
     */
    build(parsedData, filterFn) {
        const result = {};

        console.log(parsedData);
        // First pass: extract basic trait info
        for (const [id, data] of Object.entries(parsedData)) {
            // Always exclude traits with initial = no
            if (data.initial === false || data.initial === 'no') {
                continue;
            }
            
            // Apply filter if provided
            if (filterFn && !filterFn(id, data)) continue;

            // Extract cost and modifiers
            const { cost, modifiers } = this._extractCost(data);

            // Extract opposites array (incompatible traits)
            const opposites = this._extractOpposites(data);

            // Extract species_class if it exists
            const speciesClass = this._extractSpeciesClass(data);

            const traitDef = {
                cost: cost,
                no: opposites
            };

            // Add species_class if it exists
            if (speciesClass && speciesClass.length > 0) {
                traitDef.species_class = speciesClass;
            }

            // Add modifiers if they exist
            if (modifiers && Object.keys(modifiers).length > 0) {
                traitDef.modifiers = modifiers;
            }

            result[id] = traitDef;
        }

        // Second pass: make incompatibilities bidirectional
        return this._makeBidirectional(result);
    }

    /**
     * Extract cost and modifiers from trait data
     * @param {Object} data - Trait data object
     * @returns {Object} Object with cost and modifiers
     * @private
     */
    _extractCost(data) {
        let cost = 0;
        let modifiers = {};

        if (data.cost !== undefined) {
            if (typeof data.cost === 'number') {
                // Simple number cost
                cost = data.cost;
            } else if (typeof data.cost === 'object') {
                // Object format: { base = X, modifier = { ... } }
                if (data.cost.base !== undefined) {
                    // Extract base cost
                    cost = parseInt(data.cost.base);
                }
                
                // Extract modifiers if they exist
                if (data.cost.modifier) {
                    modifiers = this._extractModifiers(data.cost.modifier);
                }
                
                // Fallback if no base
                if (cost === 0 && !data.cost.base) {
                    cost = parseInt(data.cost);
                }
            } else {
                cost = parseInt(data.cost);
            }
        }

        return { cost, modifiers };
    }

    /**
     * Extract cost modifiers from modifier data
     * @param {Object|Array} modifierData - Modifier data (can be object or array of objects)
     * @returns {Object} Object mapping condition IDs to modifier values
     * @private
     */
    _extractModifiers(modifierData) {
        const modifiers = {};

        // modifierData can be a single object or array of objects
        const modifierArray = Array.isArray(modifierData) ? modifierData : [modifierData];

        for (const mod of modifierArray) {
            if (typeof mod === 'object') {
                // Look for condition keys like has_origin, has_civic, etc.
                for (const [key, value] of Object.entries(mod)) {
                    if (key.startsWith('has_')) {
                        // This is a condition (e.g., has_origin = origin_mechanists)
                        const conditionValue = value;
                        
                        // Look for the add value in the same modifier block
                        if (mod.add !== undefined) {
                            modifiers[conditionValue] = parseInt(mod.add);
                        }
                    }
                }
            }
        }

        return modifiers;
    }

    /**
     * Extract opposites from trait data
     * @param {Object} data - Trait data object
     * @returns {Array} Array of opposite trait IDs
     * @private
     */
    _extractOpposites(data) {
        const opposites = [];

        if (data.opposites) {
            // opposites can be a single string or an array
            if (typeof data.opposites === 'string') {
                opposites.push(data.opposites);
            } else if (Array.isArray(data.opposites)) {
                opposites.push(...data.opposites);
            }
        }

        return opposites;
    }

    /**
     * Extract species_class from trait data
     * @param {Object} data - Trait data object
     * @returns {Array} Array of species class IDs (e.g., ['REP', 'AVI', 'AQUATIC'])
     * @private
     */
    _extractSpeciesClass(data) {
        const speciesClasses = [];

        if (data.species_class) {
            // species_class can be a single string or an array
            if (typeof data.species_class === 'string') {
                speciesClasses.push(data.species_class);
            } else if (Array.isArray(data.species_class)) {
                speciesClasses.push(...data.species_class);
            }
        }

        return speciesClasses;
    }

    /**
     * Check if a trait has a specific species_class
     * @param {Object} data - Trait data object
     * @param {string|Array} speciesClasses - Species class(es) to check for (e.g., 'PLANT', ['PLANT', 'FUN'])
     * @returns {boolean} True if trait has any of the specified species classes
     */
    hasSpeciesClass(data, speciesClasses) {
        if (!data.species_class) {
            return false;
        }

        // Normalize speciesClasses to array
        const classesToCheck = Array.isArray(speciesClasses) ? speciesClasses : [speciesClasses];

        // species_class can be a string or an array
        let traitClasses = [];
        if (typeof data.species_class === 'string') {
            traitClasses = [data.species_class];
        } else if (Array.isArray(data.species_class)) {
            traitClasses = data.species_class;
        }

        // Check if any of the trait's species classes match what we're looking for
        return traitClasses.some(tc => classesToCheck.includes(tc));
    }

    /**
     * Check if a trait has a specific allowed_archetype
     * @param {Object} data - Trait data object
     * @param {string|Array} archetypes - Archetype(s) to check for (e.g., 'LITHOID', ['BIOLOGICAL', 'LITHOID'])
     * @returns {boolean} True if trait has any of the specified archetypes
     */
    hasAllowedArchetype(data, archetypes) {
        if (!data.allowed_archetypes) {
            return false;
        }

        // Normalize archetypes to array
        const archetypesToCheck = Array.isArray(archetypes) ? archetypes : [archetypes];

        // allowed_archetypes can be a string or an array
        let traitArchetypes = [];
        if (typeof data.allowed_archetypes === 'string') {
            traitArchetypes = [data.allowed_archetypes];
        } else if (Array.isArray(data.allowed_archetypes)) {
            traitArchetypes = data.allowed_archetypes;
        }

        // Check if any of the trait's archetypes match what we're looking for
        return traitArchetypes.some(ta => archetypesToCheck.includes(ta));
    }

    /**
     * Check if a trait is ONLY for specific archetype(s)
     * @param {Object} data - Trait data object
     * @param {string|Array} archetypes - Archetype(s) to check for (e.g., 'LITHOID')
     * @returns {boolean} True if trait ONLY allows the specified archetype(s) and nothing else
     */
    isOnlyForArchetypes(data, archetypes) {
        if (!data.allowed_archetypes) {
            return false;
        }

        // Normalize archetypes to array
        const archetypesToCheck = Array.isArray(archetypes) ? archetypes : [archetypes];

        // allowed_archetypes can be a string or an array
        let traitArchetypes = [];
        if (typeof data.allowed_archetypes === 'string') {
            traitArchetypes = [data.allowed_archetypes];
        } else if (Array.isArray(data.allowed_archetypes)) {
            traitArchetypes = data.allowed_archetypes;
        }

        // Check if trait archetypes exactly match (only contains) the specified archetypes
        return traitArchetypes.length > 0 && 
               traitArchetypes.every(ta => archetypesToCheck.includes(ta));
    }

    /**
     * Apply bidirectional incompatibilities to raw parsed data
     * This should be called on the full parsed data BEFORE filtering into categories
     * @param {Object} parsedData - Raw parsed trait data from ParadoxParser
     * @returns {Object} Updated parsed data with bidirectional opposites
     */
    applyBidirectionalToParsedData(parsedData) {
        // Create a map of all traits
        const traitsMap = new Map();
        for (const [id, data] of Object.entries(parsedData)) {
            traitsMap.set(id, data);
        }

        // Apply bidirectional logic to opposites
        for (const [id, data] of Object.entries(parsedData)) {
            if (data.opposites) {
                const opposites = Array.isArray(data.opposites) ? data.opposites : [data.opposites];
                
                for (const oppositeId of opposites) {
                    // If the opposite trait exists in our parsed data
                    if (traitsMap.has(oppositeId)) {
                        const oppositeData = traitsMap.get(oppositeId);
                        
                        // Ensure oppositeData has an opposites field
                        if (!oppositeData.opposites) {
                            oppositeData.opposites = [];
                        } else if (!Array.isArray(oppositeData.opposites)) {
                            // Convert to array if it's a single string
                            oppositeData.opposites = [oppositeData.opposites];
                        }
                        
                        // Add current trait to opposite's opposites if not already there
                        if (!oppositeData.opposites.includes(id)) {
                            oppositeData.opposites.push(id);
                        }
                    }
                }
            }
        }

        return parsedData;
    }

    /**
     * Make trait incompatibilities bidirectional
     * If trait A opposes trait B, ensure trait B also opposes trait A
     * @param {Object} definitions - Trait definitions object
     * @returns {Object} Updated definitions with bidirectional incompatibilities
     * @private
     */
    _makeBidirectional(definitions) {
        const traitsMap = new Map();

        // First pass: collect all traits
        for (const [id, def] of Object.entries(definitions)) {
            traitsMap.set(id, def);
        }

        // Second pass: add bidirectional opposites
        for (const [id, def] of Object.entries(definitions)) {
            const oppositeTraits = def.no || [];
            
            for (const oppositeId of oppositeTraits) {
                // If the opposite trait exists in our definitions
                if (traitsMap.has(oppositeId)) {
                    const oppositeDef = traitsMap.get(oppositeId);
                    
                    // Add current trait to opposite's incompatibles if not already there
                    if (!oppositeDef.no.includes(id)) {
                        oppositeDef.no.push(id);
                    }
                }
            }
        }

        return definitions;
    }
}
