import { Router } from "express";
import { requireAdmin } from "../middleware/adminAuth";
import { getStreamRemaining, executeStreamClawback } from "../controllers/stream.controller";

const router = Router();

// Middleware to ensure admin authentication
router.use(requireAdmin);

/**
 * @openapi
 * /api/admin/streams/{id}/remaining:
 *   get:
 *     summary: Calculate remaining vested amount
 *     description: Returns vesting and unclaimed values for a specific stream.
 *     tags: [Admin Streams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved remaining amounts.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalVested:
 *                   type: string
 *                 claimed:
 *                   type: string
 *                 unclaimed:
 *                   type: string
 *                 pendingClawback:
 *                   type: string
 *       404:
 *         description: Stream not found.
 */
router.get("/:id/remaining", getStreamRemaining);

/**
 * @openapi
 * /api/admin/streams/{id}/clawback:
 *   post:
 *     summary: Admin stream clawback endpoint
 *     description: Initiates a clawback for a specific stream.
 *     tags: [Admin Streams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: string
 *               unsignedTxXdr:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully processed clawback transaction.
 *       400:
 *         description: Bad request, such as amount exceeding unclaimed amount.
 *       404:
 *         description: Stream not found.
 */
router.post("/:id/clawback", executeStreamClawback);

export default router;
