// One in-flight operation per mounted scope; invalidation fences late results.
export class OperationGate {
  private sequence = 0;
  private active: number | null = null;
  private version = -1;
  begin(): number | null {
    if (this.active !== null) return null;
    this.active = ++this.sequence;
    return this.active;
  }
  valid(ticket: number): boolean {
    return ticket === this.sequence && ticket === this.active;
  }
  end(ticket: number): void {
    if (this.valid(ticket)) this.active = null;
  }
  invalidate(): void {
    this.sequence++;
    this.active = null;
    this.version = -1;
  }
  acceptVersion(version: number): boolean {
    if (version < this.version) return false;
    this.version = version;
    return true;
  }
  acknowledge(version: number): void {
    this.version = Math.max(this.version, version);
  }
}
