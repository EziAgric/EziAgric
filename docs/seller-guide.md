# Seller Onboarding Guide

This guide walks farmers and cooperatives through selling on the platform end to end:

1. Install the Freighter wallet
2. Fund your wallet with cNGN
3. Create a listing
4. Respond to a trade request
5. Submit a Proof-of-Delivery (PoD) video
6. Receive settlement

> **Audience:** Sellers (farmers / cooperatives) new to the platform.
> **Prerequisites:** A smartphone or computer with a modern browser, a valid phone number, and a government-issued ID for verification.

---

## Step 1 — Install the Freighter wallet

Freighter is the non-custodial wallet used to sign your listings and receive settlement.

1. Go to the official Freighter site and install the browser extension (or the mobile app).
2. Create a new wallet and **write down your 12-word recovery phrase** somewhere safe and offline. Never share it with anyone — support will never ask for it.
3. Set a strong password to unlock the wallet on this device.
4. Copy your **public key** (starts with `G...`). This is your seller address.

![Step 1 — Install Freighter and copy your public key](images/seller-guide/01-install-freighter.png)

> ⚠️ If you lose your recovery phrase you lose access to your funds. There is no password reset.

---

## Step 2 — Fund your wallet with cNGN

cNGN is the Naira-backed token used for trade escrow and settlement.

1. Open the platform and connect your Freighter wallet when prompted.
2. Go to **Wallet → Deposit** and copy your deposit address.
3. Send cNGN to that address from your exchange or a peer. Start with a small test amount first.
4. Wait for confirmation — your cNGN balance will appear under **Wallet → Balance**.

![Step 2 — Deposit cNGN and confirm your balance](images/seller-guide/02-fund-cngn.png)

> 💡 Keep a small buffer of cNGN for network fees. Confirm the deposit address matches the one shown in the app before sending.

---

## Step 3 — Create a listing

1. From the dashboard, select **Create Listing**.
2. Fill in the details:
   - **Commodity** (e.g. maize, rice, cassava)
   - **Quantity** and **unit** (kg, tonnes, bags)
   - **Price per unit** in cNGN
   - **Location** and **available-from date**
   - **Description** and any quality notes
3. Attach at least one clear photo of the produce.
4. Review the summary and confirm. Sign the transaction in Freighter when prompted.
5. Your listing now appears under **My Listings** with status **Active**.

![Step 3 — Create a listing form and confirmation](images/seller-guide/03-create-listing.png)

---

## Step 4 — Respond to a trade request

When a buyer is interested, you receive a trade request in **Trades → Incoming**.

1. Open the request and review the buyer's quantity, price, and delivery terms.
2. Accept to move the trade to **Escrow Funded** (the buyer's cNGN is locked in escrow), or decline with a short reason.
3. Once accepted, coordinate delivery details with the buyer through the in-app messages.

![Step 4 — Review and accept an incoming trade request](images/seller-guide/04-trade-request.png)

> 🔒 Funds stay in escrow until you submit Proof of Delivery. Do not ship before the trade shows **Escrow Funded**.

---

## Step 5 — Submit a Proof-of-Delivery (PoD) video

After delivering the goods, submit a PoD video to release escrow.

1. Open the trade and select **Submit Proof of Delivery**.
2. Record a short (30–90 second) video that clearly shows:
   - The goods being handed over or delivered
   - The quantity and packaging
   - The buyer or delivery recipient (with their consent)
3. Upload the video and add a short note describing the delivery.
4. Confirm and sign in Freighter. The trade moves to **PoD Submitted** for review.

![Step 5 — Record and upload the PoD video](images/seller-guide/05-pod-video.png)

> 📹 Keep the original video until settlement completes. Blurry or unrelated footage may be rejected and delay payment.

---

## Step 6 — Receive settlement

Once the PoD is verified, escrow releases to your wallet.

1. You will see the trade status change to **Settled**.
2. The cNGN amount (minus any platform fee shown on the trade) is credited to your Freighter wallet.
3. Check **Wallet → Balance** and your transaction history to confirm the credit.
4. Withdraw or hold your cNGN as needed.

![Step 6 — Settlement credited to your wallet](images/seller-guide/06-settlement.png)

> ✅ Settlement is final once the trade shows **Settled**. If funds do not arrive, open a support ticket with the trade ID.

---

## Quick reference

| Step | Action | Where |
| --- | --- | --- |
| 1 | Install Freighter, save recovery phrase | Freighter |
| 2 | Deposit cNGN | Wallet → Deposit |
| 3 | Create listing | Create Listing |
| 4 | Accept trade request | Trades → Incoming |
| 5 | Submit PoD video | Trade → Submit Proof of Delivery |
| 6 | Receive settlement | Wallet → Balance |

---

## Hausa translation (placeholder)

> **TODO:** A Hausa translation of this guide is planned for future work.
> When available, it will live at `docs/seller-guide.ha.md` and be linked from this section.
> Until then, sellers who prefer Hausa should contact support for assisted onboarding.

---

## Screenshot assets

Screenshots referenced above live under `docs/images/seller-guide/`. If an image is missing, capture it from the current app build and open a PR to add it — keep filenames matching the references in this guide.
