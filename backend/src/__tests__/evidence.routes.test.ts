import express from "express";
import request from "supertest";
import { createEvidenceRouter } from "../routes/evidence.routes";
import { ServiceUnavailableError } from "../services/ipfs.service";

jest.mock("../middleware/auth.middleware", () => ({
    authMiddleware: (req: any, _res: any, next: any) => {
        req.user = { walletAddress: "GCBUYER0000000000000000000000000000000000000000000000000" };
        next();
    },
}));

describe("Evidence routes streaming fallback", () => {
    it("returns 502 when IPFS streaming is unavailable", async () => {
        const evidenceService = {
            streamFromIPFS: jest.fn().mockRejectedValue(new ServiceUnavailableError()),
        } as any;

        const app = express();
        app.use(createEvidenceRouter(evidenceService));

        const res = await request(app).get("/evidence/bafydeadbeef/stream").expect(502);

        expect(res.body).toEqual({ error: "Failed to stream from IPFS gateway" });
        expect(evidenceService.streamFromIPFS).toHaveBeenCalledWith("bafydeadbeef", undefined);
    });
});
