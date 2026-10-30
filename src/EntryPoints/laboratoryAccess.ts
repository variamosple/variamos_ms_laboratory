import { hasPermissions } from "@variamosple/variamos-security";

/**
 * Permission of the Administration module that opens the Laboratory. Only the
 * Administrator role holds it at first; an administrator grants it to other
 * roles in the Roles page. It also shows the Laboratory tab of the platform menu.
 */
export const LABORATORY_ACCESS_PERMISSION = "laboratory::access";

/**
 * Guards every route but /health: a signed-in account without the permission
 * gets 403 before any work, so runs only start for granted accounts.
 * The permissions travel in the session token: no database query.
 */
export const hasLaboratoryAccess = hasPermissions([LABORATORY_ACCESS_PERMISSION]);
