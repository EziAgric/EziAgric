# Mediator Guide

This guide explains how mediators are selected, vetted, and removed from the Amana
mediator registry, and how they resolve disputes. It is intended for cooperatives and
organizations that want to apply to become mediators.

> Terms such as *loss ratio*, *bps*, *PoD*, and *manifest* are defined in the
> [glossary](./glossary.md).

---

## 1. Eligibility criteria

To be considered for the mediator registry, an applicant must:

- Be a legally registered cooperative, organization, or association (individuals are not
  admitted to the registry).
- Operate in or serve the region where the trades it will mediate occur.
- Have a verifiable track record in agricultural trade, logistics, or dispute resolution.
- Maintain the minimum stake described in [Stake requirements](#4-stake-requirements).
- Agree to the dispute-resolution policy and the evidence-handling rules in this guide.
- Not be a party to, or financially interested in, any trade it mediates.

## 2. Application process

1. **Submit an application.** Open a *Mediator application* issue using the repository
   template, including the organization name, registration details, region, and a contact
   for the registry administrators.
2. **Provide evidence.** Attach proof of registration, a description of relevant
   experience, and the Stellar account that will hold the mediator stake.
3. **Review.** Registry administrators review the application against the eligibility
   criteria and may request additional information.
4. **Stake.** Once approved, the applicant funds the mediator stake from the declared
   account (see [Stake requirements](#4-stake-requirements)).
5. **Registration.** An administrator adds the account to the mediator registry. The
   mediator is now eligible to be selected for disputes.

Applications that are incomplete or that fail the eligibility criteria are closed with a
reason. Applicants may re-apply after addressing the feedback.

## 3. Quorum rules

Disputes are resolved by a quorum of registered mediators rather than a single mediator.

- **Selection.** For each dispute, the contract selects mediators from the registry. A
  mediator that is a party to the trade, or that has a conflict of interest, is excluded.
- **Quorum size.** A dispute requires a quorum of **three** mediators to reach a decision.
  If fewer than three eligible mediators are available, the dispute waits until the quorum
  can be formed.
- **Voting.** Each selected mediator reviews the evidence (including any PoD video stored
  on IPFS) and casts a vote for the buyer, the seller, or a split according to the agreed
  `Loss_Ratio`.
- **Decision.** A decision is reached when a majority of the quorum agrees. Ties are
  resolved by the registry administrators.
- **Settlement.** The contract distributes funds according to the decision: 100% to one
  party, or split via the `Loss_Ratio`.

## 4. Stake requirements

- Each registered mediator must maintain a stake in the mediator's declared Stellar
  account for as long as it remains in the registry.
- The stake is a bond against negligent or malicious mediation. A mediator that is removed
  for misconduct may have its stake slashed according to the dispute-resolution policy.
- If a mediator's stake falls below the required minimum, the mediator is suspended from
  selection until the stake is restored.

## 5. Admin keys and governance

The mediator registry is governed by registry administrators:

- **Admin keys.** Administrators hold the keys authorized to add, suspend, and remove
  mediators, and to resolve tied quorum votes.
- **Adding mediators.** Only administrators may register a mediator after the application
  and staking steps are complete.
- **Suspension and removal.** Administrators may suspend a mediator (for example, when its
  stake falls below the minimum) or remove it for misconduct, conflict of interest, or
  repeated failure to participate in assigned disputes.
- **Transparency.** Every registry change (addition, suspension, removal) is recorded so
  that cooperatives and organizations can audit how the registry is governed.

## 6. Worked example: a dispute resolution case

1. A buyer and seller agree on a 70/30 loss ratio and the buyer locks funds in escrow.
2. The seller dispatches goods with a driver manifest. On delivery, the buyer finds part of
   the shipment damaged and uploads a PoD video of the loss with driver affirmation.
3. The trade enters dispute. The contract selects three eligible mediators from the
   registry, excluding any mediator connected to either party.
4. Each mediator reviews the PoD video and the manifest, then votes. Two mediators vote to
   split the loss 70/30; one votes for the seller. The majority decision is a 70/30 split.
5. The contract settles the escrow: 70% of the funds go to the seller and 30% is returned
   to the buyer, in line with the agreed `Loss_Ratio`.
6. The dispute outcome is recorded, and the mediators return to the pool for future
   selection.

---

Questions about the registry or an application? Open a *Mediator application* issue and a
registry administrator will follow up.
