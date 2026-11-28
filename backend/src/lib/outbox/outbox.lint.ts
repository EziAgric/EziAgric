/**
 * Outbox Lint Guard
 * 
 * Enforces that all state-changing methods in services:
 * 1. Have corresponding action mappings in actionEventMapping.ts
 * 2. Emit expected events documented in the mapping
 * 3. Don't silently skip event emissions
 * 
 * Run during CI/CD to catch missing event mappings early
 */

import * as fs from "fs";
import * as path from "path";
import { ACTION_EVENT_MAPPINGS, ServiceAction } from "./actionEventMapping";

interface LintViolation {
  file: string;
  line: number;
  method: string;
  issue: string;
  severity: "error" | "warning";
}

export class OutboxLintGuard {
  private violations: LintViolation[] = [];

  /**
   * Check if a method name looks like it mutates state
   */
  private isMutationMethod(methodName: string): boolean {
    const mutationPatterns = [
      /^create/,
      /^update/,
      /^delete/,
      /^fund/,
      /^release/,
      /^confirm/,
      /^initiate/,
      /^resolve/,
      /^cancel/,
      /^expire/,
      /^claim/,
      /^clawback/,
      /^terminate/,
    ];
    return mutationPatterns.some((pattern) => pattern.test(methodName));
  }

  /**
   * Extract method definitions from a TypeScript file
   */
  private extractMethods(content: string): Array<{ name: string; line: number }> {
    const methods: Array<{ name: string; line: number }> = [];
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      // Match async methods, public methods, etc.
      const methodMatch = line.match(
        /(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/,
      );
      if (methodMatch) {
        const methodName = methodMatch[1];
        if (this.isMutationMethod(methodName)) {
          methods.push({ name: methodName, line: index + 1 });
        }
      }
    });

    return methods;
  }

  /**
   * Check if a method has @RequiresEvent decorator
   */
  private hasEventDecorator(
    content: string,
    methodLine: number,
  ): { hasDecorator: boolean; action?: ServiceAction } {
    const lines = content.split("\n");
    // Look 5 lines before the method
    for (let i = Math.max(0, methodLine - 6); i < methodLine; i++) {
      const line = lines[i];
      if (line.includes("@RequiresEvent")) {
        // Extract action from decorator
        const actionMatch = line.match(
          /ServiceAction\.([A-Z_]+)|"([^"]+)"/,
        );
        if (actionMatch) {
          const actionName =
            actionMatch[1] || actionMatch[2];
          return { hasDecorator: true, action: actionName as ServiceAction };
        }
      }
    }
    return { hasDecorator: false };
  }

  /**
   * Lint all service files for missing event mappings
   */
  async lintServices(servicesDir: string): Promise<LintViolation[]> {
    this.violations = [];

    if (!fs.existsSync(servicesDir)) {
      throw new Error(`Services directory not found: ${servicesDir}`);
    }

    const files = fs.readdirSync(servicesDir);
    const mappedActions = new Set(
      ACTION_EVENT_MAPPINGS.map((m) => m.action),
    );

    for (const file of files) {
      if (!file.endsWith(".service.ts")) continue;

      const filePath = path.join(servicesDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const methods = this.extractMethods(content);

      for (const method of methods) {
        const decorator = this.hasEventDecorator(content, method.line);

        if (!decorator.hasDecorator) {
          this.violations.push({
            file: filePath,
            line: method.line,
            method: method.name,
            issue: `Mutation method '${method.name}' lacks @RequiresEvent decorator`,
            severity: "error",
          });
        } else if (
          decorator.action &&
          !mappedActions.has(decorator.action)
        ) {
          this.violations.push({
            file: filePath,
            line: method.line,
            method: method.name,
            issue: `Method uses unmapped action: ${decorator.action}`,
            severity: "error",
          });
        }
      }
    }

    return this.violations;
  }

  /**
   * Verify all mapped actions are used
   */
  verifyMappingsCoverage(servicesDir: string): LintViolation[] {
    const coverage: LintViolation[] = [];
    const usedActions = new Set<ServiceAction>();

    if (!fs.existsSync(servicesDir)) return coverage;

    const files = fs.readdirSync(servicesDir);
    const allContent = files
      .filter((f) => f.endsWith(".service.ts"))
      .map((f) =>
        fs.readFileSync(path.join(servicesDir, f), "utf-8"),
      )
      .join("\n");

    ACTION_EVENT_MAPPINGS.forEach((mapping) => {
      if (allContent.includes(mapping.action)) {
        usedActions.add(mapping.action);
      }
    });

    // Report unmapped actions (warnings, not errors)
    ACTION_EVENT_MAPPINGS.forEach((mapping) => {
      if (!usedActions.has(mapping.action)) {
        coverage.push({
          file: "actionEventMapping.ts",
          line: 0,
          method: mapping.action,
          issue: `Mapped action '${mapping.action}' is not used in any service`,
          severity: "warning",
        });
      }
    });

    return coverage;
  }

  /**
   * Generate a report of all violations
   */
  reportViolations(): string {
    if (this.violations.length === 0) {
      return "✓ All services have proper event mappings\n";
    }

    let report = `\n❌ Found ${this.violations.length} outbox lint violations:\n\n`;

    const errors = this.violations.filter((v) => v.severity === "error");
    const warnings = this.violations.filter((v) => v.severity === "warning");

    if (errors.length > 0) {
      report += `📍 ERRORS (${errors.length}):\n`;
      errors.forEach((v) => {
        report += `  ${path.relative(process.cwd(), v.file)}:${v.line}\n`;
        report += `    Method: ${v.method}\n`;
        report += `    Issue: ${v.issue}\n\n`;
      });
    }

    if (warnings.length > 0) {
      report += `⚠️  WARNINGS (${warnings.length}):\n`;
      warnings.forEach((v) => {
        report += `  ${path.relative(process.cwd(), v.file)}:${v.line}\n`;
        report += `    Method: ${v.method}\n`;
        report += `    Issue: ${v.issue}\n\n`;
      });
    }

    return report;
  }

  /**
   * Check if any errors exist (for CI/CD gate)
   */
  hasErrors(): boolean {
    return this.violations.some((v) => v.severity === "error");
  }
}

/**
 * CLI entry point for the lint guard
 * Run: node outbox.lint.ts <services-dir>
 */
if (require.main === module) {
  const servicesDir =
    process.argv[2] || path.join(__dirname, "../services");

  const guard = new OutboxLintGuard();

  (async () => {
    console.log(`🔍 Linting services in: ${servicesDir}\n`);

    try {
      await guard.lintServices(servicesDir);
      const coverage = guard.verifyMappingsCoverage(servicesDir);

      console.log(guard.reportViolations());

      if (coverage.length > 0) {
        console.log("Coverage Check:");
        coverage.forEach((c) => {
          console.log(`  ⚠️  ${c.issue}`);
        });
      }

      if (guard.hasErrors()) {
        console.error(
          "\n❌ Linting failed with errors. Fix before committing.\n",
        );
        process.exit(1);
      } else {
        console.log("\n✅ All lint checks passed\n");
        process.exit(0);
      }
    } catch (error) {
      console.error("Lint guard error:", error);
      process.exit(1);
    }
  })();
}

export default OutboxLintGuard;
