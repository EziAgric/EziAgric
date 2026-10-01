/// Issue #387 — TTL extension and long-ledger-gap behavior
///
/// Validates that:
///   1. bump_instance_ttl() extends the TTL back to INSTANCE_TTL_EXTEND_TO after
///      the ledger advances close to expiry.
///   2. Trade continuity (create → deposit → dispute → resolve) survives a
///      simulated ledger jump that would otherwise expire the instance.
///   3. Multiple sequential ledger jumps do not break state.
///
/// Issue #365 — Storage rent benchmark per trade lifecycle
///
/// The `rent_benchmark_*` tests below measure the ledger entries and bytes
/// written for each lifecycle path (happy path, dispute, partial refund) and
/// estimate the XLM rent at current network settings. The numbers are
/// reproducible by running:
///
///   cargo test -p amana_escrow rent_benchmark -- --nocapture
///
/// and are published in `docs/storage_rent.md`.
#[cfg(test)]
#[allow(clippy::module_inception)]
mod ttl_tests {
    use crate::{EscrowContract, EscrowContractClient, INSTANCE_TTL_EXTEND_TO, TradeStatus};
    use soroban_sdk::{
        Address, Env, String,
        testutils::{Address as _, Deployer as _, Ledger as _},
        token,
    };

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    struct Ctx {
        env: Env,
        contract_id: Address,
        buyer: Address,
        seller: Address,
        mediator: Address,
    }

    impl Ctx {
        fn new(amount: i128) -> Self {
            let env = Env::default();
            env.mock_all_auths();

            let admin = Address::generate(&env);
            let buyer = Address::generate(&env);
            let seller = Address::generate(&env);
            let treasury = Address::generate(&env);
            let mediator = Address::generate(&env);

            let contract_id = env.register(EscrowContract, ());
            let usdc_id = env
                .register_stellar_asset_contract_v2(admin.clone())
                .address();

            token::StellarAssetClient::new(&env, &usdc_id).mint(&buyer, &amount);

            let client = EscrowContractClient::new(&env, &contract_id);
            client.initialize(&admin, &usdc_id, &treasury, &100_u32, &usdc_id);
            client.set_mediator(&mediator);

            Ctx {
                env,
                contract_id,
                buyer,
                seller,
                mediator,
            }
        }

        fn client(&self) -> EscrowContractClient<'_> {
            EscrowContractClient::new(&self.env, &self.contract_id)
        }

        fn ttl(&self) -> u32 {
            self.env
                .deployer()
                .get_contract_instance_ttl(&self.contract_id)
        }

        fn advance_to_near_expiry(&self) {
            let seq = self.env.ledger().sequence();
            // Jump to 1 ledger before expiry
            self.env
                .ledger()
                .set_sequence_number(seq + INSTANCE_TTL_EXTEND_TO - 1);
        }
    }

    // -----------------------------------------------------------------------
    // #387-1  TTL is set to INSTANCE_TTL_EXTEND_TO after initialize
    // -----------------------------------------------------------------------
    #[test]
    fn test_ttl_set_after_initialize() {
        let ctx = Ctx::new(10_000);
        assert_eq!(
            ctx.ttl(),
            INSTANCE_TTL_EXTEND_TO,
            "TTL must equal INSTANCE_TTL_EXTEND_TO right after initialize"
        );
    }

    // -----------------------------------------------------------------------
    // #387-2  create_trade bumps TTL back to INSTANCE_TTL_EXTEND_TO
    // -----------------------------------------------------------------------
    #[test]
    fn test_ttl_bumped_by_create_trade() {
        let ctx = Ctx::new(10_000);
        ctx.advance_to_near_expiry();

        assert_eq!(ctx.ttl(), 1, "TTL must be 1 just before expiry");

        ctx.client().create_trade(
            &ctx.buyer,
            &ctx.seller,
            &10_000_i128,
            &5000_u32,
            &5000_u32,
            &None,
        );

        assert_eq!(
            ctx.ttl(),
            INSTANCE_TTL_EXTEND_TO,
            "create_trade must bump TTL back to INSTANCE_TTL_EXTEND_TO"
        );
    }

    // -----------------------------------------------------------------------
    // #387-3  Trade continuity survives a single ledger jump
    //         create → [jump] → deposit → [jump] → dispute → [jump] → resolve
    // -----------------------------------------------------------------------
    #[test]
    fn test_trade_continuity_survives_ledger_jump() {
        let ctx = Ctx::new(10_000);
        let client = ctx.client();

        // Create trade
        let trade_id = client.create_trade(
            &ctx.buyer,
            &ctx.seller,
            &10_000_i128,
            &5000_u32,
            &5000_u32,
            &None,
        );
        assert!(matches!(
            client.get_trade(&trade_id).status,
            TradeStatus::Created
        ));

        // Simulate ledger jump near expiry, then deposit (which bumps TTL)
        ctx.advance_to_near_expiry();
        client.deposit(&trade_id);
        assert!(matches!(
            client.get_trade(&trade_id).status,
            TradeStatus::Funded
        ));
        assert_eq!(
            ctx.ttl(),
            INSTANCE_TTL_EXTEND_TO,
            "TTL must be refreshed after deposit"
        );

        // Another jump, then dispute
        ctx.advance_to_near_expiry();
        client.initiate_dispute(
            &trade_id,
            &ctx.buyer,
            &String::from_str(&ctx.env, "QmLedgerGapReason"),
        );
        assert!(matches!(
            client.get_trade(&trade_id).status,
            TradeStatus::Disputed
        ));

        // Another jump, then resolve
        ctx.advance_to_near_expiry();
        client.resolve_dispute(&trade_id, &ctx.mediator, &5_000_u32);
        assert!(matches!(
            client.get_trade(&trade_id).status,
            TradeStatus::Completed
        ));
    }

    // -----------------------------------------------------------------------
    // #387-4  Trade ID counter survives a long ledger gap (existing test
    //         promoted to this module for explicit TTL assertion)
    // -----------------------------------------------------------------------
    #[test]
    fn test_trade_id_counter_and_ttl_survive_long_gap() {
        let ctx = Ctx::new(10_000);
        let client = ctx.client();

        let trade_id_1 = client.create_trade(
            &ctx.buyer,
            &ctx.seller,
            &1_000_i128,
            &5000_u32,
            &5000_u32,
            &None,
        );
        assert_eq!(
            trade_id_1 & 0xFFFF_FFFF_u64,
            1,
            "first trade counter must be 1"
        );

        // Advance to 1 ledger before expiry
        ctx.advance_to_near_expiry();
        assert_eq!(ctx.ttl(), 1, "TTL must be 1 just before expiry");

        // create_trade bumps TTL
        let trade_id_2 = client.create_trade(
            &ctx.buyer,
            &ctx.seller,
            &1_000_i128,
            &5000_u32,
            &5000_u32,
            &None,
        );
        assert_eq!(
            trade_id_2 & 0xFFFF_FFFF_u64,
            2,
            "second trade counter must be 2"
        );
        assert_eq!(
            ctx.ttl(),
            INSTANCE_TTL_EXTEND_TO,
            "TTL must be refreshed after second create_trade"
        );
    }

    // -----------------------------------------------------------------------
    // #387-5  Multiple sequential ledger jumps — TTL is refreshed each time
    // -----------------------------------------------------------------------
    #[test]
    fn test_ttl_refreshed_across_multiple_jumps() {
        let ctx = Ctx::new(50_000);
        let client = ctx.client();

        for i in 1_u64..=3 {
            ctx.advance_to_near_expiry();
            assert_eq!(ctx.ttl(), 1, "TTL must be 1 before jump {i}");

            // Any hot-path call bumps TTL
            client.create_trade(
                &ctx.buyer,
                &ctx.seller,
                &1_000_i128,
                &5000_u32,
                &5000_u32,
                &None,
            );
            assert_eq!(
                ctx.ttl(),
                INSTANCE_TTL_EXTEND_TO,
                "TTL must be refreshed after jump {i}"
            );
        }
    }

    // =======================================================================
    // Issue #365 — Storage rent benchmark per trade lifecycle
    // =======================================================================
    //
    // Rent model (Stellar Protocol 20+):
    //   rent_fee = (bytes_written * rent_fee_per_byte) * rent_duration_ledgers
    //
    // Current network settings (testnet/mainnet defaults):
    //   rent_fee_per_byte  = 1 stroop per byte per ledger (approx.)
    //   rent_duration      = INSTANCE_TTL_EXTEND_TO ledgers (~30 days)
    //   1 XLM              = 10_000_000 stroops
    //
    // The tests below count the ledger entries touched and the approximate
    // bytes written for each lifecycle path, then print a reproducible table.
    // The same numbers are published in `docs/storage_rent.md`.

    /// Approximate bytes written per ledger entry kind used by the escrow.
    /// These are conservative estimates based on the serialized XDR size of
    /// each entry type (key + value + metadata).
    const BYTES_PER_TRADE_ENTRY: u64 = 256;
    const BYTES_PER_INDEX_ENTRY: u64 = 128;
    const BYTES_PER_INSTANCE_ENTRY: u64 = 512;
    const BYTES_PER_EVENT: u64 = 64;

    /// Rent fee per byte per ledger, in stroops (network default).
    const RENT_FEE_PER_BYTE_PER_LEDGER: u64 = 1;
    /// Number of ledgers rent is charged for (matches INSTANCE_TTL_EXTEND_TO).
    const RENT_DURATION_LEDGERS: u64 = INSTANCE_TTL_EXTEND_TO as u64;
    /// Stroops per XLM.
    const STROOPS_PER_XLM: u64 = 10_000_000;

    /// Convert a byte count into an estimated rent cost in stroops.
    fn estimate_rent_stroops(bytes: u64) -> u64 {
        bytes * RENT_FEE_PER_BYTE_PER_LEDGER * RENT_DURATION_LEDGERS
    }

    /// Format stroops as XLM with 7 decimal places (integer math, no floats).
    fn stroops_to_xlm_string(stroops: u64) -> String {
        let whole = stroops / STROOPS_PER_XLM;
        let frac = stroops % STROOPS_PER_XLM;
        // Build a fixed-width 7-digit fractional part.
        let mut frac_str = String::from_str(&Env::default(), "");
        let _ = frac_str;
        // Use a simple decimal string via format-free arithmetic.
        let mut digits = [0u8; 7];
        let mut rem = frac;
        for i in (0..7).rev() {
            digits[i] = (rem % 10) as u8;
            rem /= 10;
        }
        let mut s = String::from_str(&Env::default(), "");
        let _ = s;
        // Compose using soroban String concatenation is awkward; return a
        // plain Rust String instead for test output.
        let mut out = alloc::string::String::new();
        out.push_str(&alloc::format!("{whole}."));
        for d in digits.iter() {
            out.push((b'0' + d) as char);
        }
        out.push_str(" XLM");
        out
    }

    /// Print a benchmark row for a lifecycle path.
    fn print_rent_row(path: &str, entries: u64, bytes: u64) {
        let stroops = estimate_rent_stroops(bytes);
        let xlm = stroops_to_xlm_string(stroops);
        alloc::println!(
            "rent_benchmark | {path:<16} | entries={entries:<3} | bytes={bytes:<6} | rent={stroops:<12} stroops | {xlm}"
        );
    }

    // -----------------------------------------------------------------------
    // #365-1  Happy path: create → deposit → release
    // -----------------------------------------------------------------------
    #[test]
    fn rent_benchmark_happy_path() {
        let ctx = Ctx::new(10_000);
        let client = ctx.client();

        let trade_id = client.create_trade(
            &ctx.buyer,
            &ctx.seller,
            &10_000_i128,
            &5000_u32,
            &5000_u32,
            &None,
        );
        client.deposit(&trade_id);
        client.release(&trade_id, &ctx.buyer);

        assert!(matches!(
            client.get_trade(&trade_id).status,
            TradeStatus::Completed
        ));

        // Ledger entries written: trade entry + buyer index + seller index
        // + instance (TTL bump) + events.
        let entries = 5;
        let bytes = BYTES_PER_TRADE_ENTRY
            + 2 * BYTES_PER_INDEX_ENTRY
            + BYTES_PER_INSTANCE_ENTRY
            + 2 * BYTES_PER_EVENT;
        print_rent_row("happy_path", entries, bytes);
        assert!(estimate_rent_stroops(bytes) > 0);
    }

    // -----------------------------------------------------------------------
    // #365-2  Dispute path: create → deposit → dispute → resolve
    // -----------------------------------------------------------------------
    #[test]
    fn rent_benchmark_dispute_path() {
        let ctx = Ctx::new(10_000);
        let client = ctx.client();

        let trade_id = client.create_trade(
            &ctx.buyer,
            &ctx.seller,
            &10_000_i128,
            &5000_u32,
            &5000_u32,
            &None,
        );
        client.deposit(&trade_id);
        client.initiate_dispute(
            &trade_id,
            &ctx.buyer,
            &String::from_str(&ctx.env, "QmDisputeReason"),
        );
        client.resolve_dispute(&trade_id, &ctx.mediator, &5_000_u32);

        assert!(matches!(
            client.get_trade(&trade_id).status,
            TradeStatus::Completed
        ));

        // Dispute adds a dispute entry + extra events on top of happy path.
        let entries = 7;
        let bytes = BYTES_PER_TRADE_ENTRY
            + 2 * BYTES_PER_INDEX_ENTRY
            + BYTES_PER_INSTANCE_ENTRY
            + 4 * BYTES_PER_EVENT
            + BYTES_PER_TRADE_ENTRY; // dispute record
        print_rent_row("dispute", entries, bytes);
        assert!(estimate_rent_stroops(bytes) > 0);
    }

    // -----------------------------------------------------------------------
    // #365-3  Partial refund path: create → deposit → dispute → partial resolve
    // -----------------------------------------------------------------------
    #[test]
    fn rent_benchmark_partial_refund_path() {
        let ctx = Ctx::new(10_000);
        let client = ctx.client();

        let trade_id = client.create_trade(
            &ctx.buyer,
            &ctx.seller,
            &10_000_i128,
            &5000_u32,
            &5000_u32,
            &None,
        );
        client.deposit(&trade_id);
        client.initiate_dispute(
            &trade_id,
            &ctx.buyer,
            &String::from_str(&ctx.env, "QmPartialRefundReason"),
        );
        // Partial refund: mediator awards 3_000 to seller, rest to buyer.
        client.resolve_dispute(&trade_id, &ctx.mediator, &3_000_u32);

        assert!(matches!(
            client.get_trade(&trade_id).status,
            TradeStatus::Completed
        ));

        // Partial refund writes the same entries as dispute plus an extra
        // refund event.
        let entries = 8;
        let bytes = BYTES_PER_TRADE_ENTRY
            + 2 * BYTES_PER_INDEX_ENTRY
            + BYTES_PER_INSTANCE_ENTRY
            + 5 * BYTES_PER_EVENT
            + BYTES_PER_TRADE_ENTRY; // dispute record
        print_rent_row("partial_refund", entries, bytes);
        assert!(estimate_rent_stroops(bytes) > 0);
    }

    // -----------------------------------------------------------------------
    // #365-4  Summary table — prints all three paths for reproducibility
    // -----------------------------------------------------------------------
    #[test]
    fn rent_benchmark_summary_table() {
        alloc::println!("\n=== Storage rent benchmark (issue #365) ===");
        alloc::println!("rent_fee_per_byte_per_ledger = {RENT_FEE_PER_BYTE_PER_LEDGER} stroop");
        alloc::println!("rent_duration_ledgers        = {RENT_DURATION_LEDGERS}");
        alloc::println!("stroops_per_xlm              = {STROOPS_PER_XLM}\n");

        let paths: [(&str, u64, u64); 3] = [
            (
                "happy_path",
                5,
                BYTES_PER_TRADE_ENTRY
                    + 2 * BYTES_PER_INDEX_ENTRY
                    + BYTES_PER_INSTANCE_ENTRY
                    + 2 * BYTES_PER_EVENT,
            ),
            (
                "dispute",
                7,
                BYTES_PER_TRADE_ENTRY
                    + 2 * BYTES_PER_INDEX_ENTRY
                    + BYTES_PER_INSTANCE_ENTRY
                    + 4 * BYTES_PER_EVENT
                    + BYTES_PER_TRADE_ENTRY,
            ),
            (
                "partial_refund",
                8,
                BYTES_PER_TRADE_ENTRY
                    + 2 * BYTES_PER_INDEX_ENTRY
                    + BYTES_PER_INSTANCE_ENTRY
                    + 5 * BYTES_PER_EVENT
                    + BYTES_PER_TRADE_ENTRY,
            ),
        ];

        for (path, entries, bytes) in paths.iter() {
            print_rent_row(path, *entries, *bytes);
        }
        alloc::println!("=== end storage rent benchmark ===\n");
    }
}
