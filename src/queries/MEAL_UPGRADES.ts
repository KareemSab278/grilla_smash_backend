export const MEAL_UPGRADES = {
    list: `SELECT id, name, price AS upgrade_price, active, sort_order
           FROM meal_upgrades ORDER BY sort_order, name, id`,
    byId: `SELECT id, name, price AS upgrade_price, active, sort_order
           FROM meal_upgrades WHERE id = $1`,
    mains: `SELECT meal_upgrade_id, product_id FROM meal_upgrade_mains
            WHERE ($1::text IS NULL OR meal_upgrade_id = $1) ORDER BY product_id`,
    groups: `SELECT id, meal_upgrade_id, name, min_selections, max_selections, sort_order
             FROM meal_upgrade_groups WHERE ($1::text IS NULL OR meal_upgrade_id = $1)
             ORDER BY sort_order, name, id`,
    choices: `SELECT c.id, c.group_id, c.product_id, c.surcharge, c.active, c.sort_order
              FROM meal_upgrade_choices c JOIN meal_upgrade_groups g ON g.id = c.group_id
              WHERE ($1::text IS NULL OR g.meal_upgrade_id = $1)
              ORDER BY c.sort_order, c.id`,
    insert: `INSERT INTO meal_upgrades (id, name, price, active, sort_order) VALUES ($1, $2, $3, $4, $5)`,
    update: `UPDATE meal_upgrades SET name = COALESCE($2, name), price = COALESCE($3, price),
             active = COALESCE($4, active), sort_order = COALESCE($5, sort_order), updated_at = now()
             WHERE id = $1 RETURNING id`,
    delete: `DELETE FROM meal_upgrades WHERE id = $1 RETURNING id`,
    deleteMains: `DELETE FROM meal_upgrade_mains WHERE meal_upgrade_id = $1`,
    insertMain: `INSERT INTO meal_upgrade_mains (meal_upgrade_id, product_id) VALUES ($1, $2)`,
    deleteGroupsExcept: `DELETE FROM meal_upgrade_groups WHERE meal_upgrade_id = $1 AND NOT (id = ANY($2::text[]))`,
    insertGroup: `INSERT INTO meal_upgrade_groups (id, meal_upgrade_id, name, min_selections, max_selections, sort_order)
                  VALUES ($1, $2, $3, $4, $5, $6)`,
    updateGroup: `UPDATE meal_upgrade_groups SET name = $3, min_selections = $4, max_selections = $5, sort_order = $6
                  WHERE id = $1 AND meal_upgrade_id = $2 RETURNING id`,
    deleteChoicesExcept: `DELETE FROM meal_upgrade_choices WHERE group_id = $1 AND NOT (product_id = ANY($2::text[]))`,
    upsertChoice: `INSERT INTO meal_upgrade_choices (id, group_id, product_id, surcharge, active, sort_order)
                   VALUES ($1, $2, $3, $4, COALESCE($5, true), $6)
                   ON CONFLICT (group_id, product_id) DO UPDATE SET surcharge = EXCLUDED.surcharge,
                   active = COALESCE($5, meal_upgrade_choices.active), sort_order = EXCLUDED.sort_order`,
} as const;
