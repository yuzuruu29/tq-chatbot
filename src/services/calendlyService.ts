// TQ ChatBot #1 - Calendly Service
// Safe stub implementation for Calendly integration

interface CalendlyBookingData {
  eventId: string;
  eventType: string;
  startTime: string;
  endTime: string;
  email: string;
  name: string;
  uri: string;
}

/**
 * Calendly Service - Safe stub implementation
 * In production, this would integrate with Calendly API or webhooks
 */
export class CalendlyService {
  private static instance: CalendlyService;
  private config: { calendlyUrl: string; eventTypes?: string[]; prefillData?: Record<string, string> } | null = null;
  private events: CalendlyBookingData[] = [];
  private shownCount = 0;
  private clickedCount = 0;
  private bookedCount = 0;

  private constructor() {
    // Initialize with environment variables if available
    const calendlyUrl = import.meta.env.VITE_CALENDLY_URL;
    if (calendlyUrl) {
      this.config = {
        calendlyUrl,
        eventTypes: import.meta.env.VITE_CALENDLY_EVENT_TYPES?.split(",") || [],
        prefillData: {}
      };
    }
  }

  public static getInstance(): CalendlyService {
    if (!CalendlyService.instance) {
      CalendlyService.instance = new CalendlyService();
    }
    return CalendlyService.instance;
  }

  /**
   * Check if Calendly is configured
   */
  public isConfigured(): boolean {
    return !!this.config;
  }

  /**
   * Initialize Calendly with tenant-specific configuration
   */
  public initialize(calendlyUrl: string, eventTypes?: string[]): void {
    this.config = {
      calendlyUrl,
      eventTypes,
      prefillData: {}
    };
  }

  /**
   * Get Calendly URL for embedding
   */
  public getEmbedUrl(): string | null {
    if (!this.config) {
      return null;
    }
    return this.config.calendlyUrl;
  }

  /**
   * Show Calendly widget
   * Records a "shown" event
   */
  public async showWidget(_visitorId: string): Promise<void> {
    this.shownCount++;
    console.log(`Calendly widget shown`);
    
    // In production, this would trigger analytics
    // For now, just log the event
  }

  /**
   * Record Calendly click event
   */
  public async recordClick(_visitorId: string): Promise<void> {
    this.clickedCount++;
    console.log(`Calendly widget clicked`);
  }

  /**
   * Handle Calendly booking
   * In production, this would be triggered by Calendly webhook
   */
  public async handleBooking(bookingData: CalendlyBookingData): Promise<void> {
    this.bookedCount++;
    this.events.push(bookingData);
    console.log(`Calendly booking confirmed:`, bookingData);
  }

  /**
   * Get Calendly metrics
   */
  public getMetrics(): {
    shown: number;
    clicked: number;
    booked: number;
    conversionRate: number;
  } {
    const shown = this.shownCount;
    const clicked = this.clickedCount;
    const booked = this.bookedCount;
    const conversionRate = shown > 0 ? (booked / shown) * 100 : 0;
    
    return {
      shown,
      clicked,
      booked,
      conversionRate
    };
  }

  /**
   * Get recent bookings
   */
  public getRecentBookings(limit = 10): CalendlyBookingData[] {
    return this.events.slice(-limit).reverse();
  }

  /**
   * Generate Calendly embed script
   */
  public getEmbedScript(elementId: string = "calendly-widget"): string | null {
    if (!this.config) {
      return null;
    }
    
    return `
      <div id="${elementId}" style="min-width:320px;height:630px;"></div>
      <script type="text/javascript" src="https://assets.calendly.com/assets/external/widget.js"></script>
      <script type="text/javascript">
        Calendly.initInlineWidget({
          url: '${this.config.calendlyUrl}',
          parentElement: document.getElementById('${elementId}'),
          prefill: ${JSON.stringify(this.config.prefillData || {})},
          utm: {}
        });
      </script>
    `;
  }

  /**
   * Set prefill data for Calendly widget
   */
  public setPrefillData(data: Record<string, string>): void {
    if (this.config) {
      this.config.prefillData = data;
    }
  }

  /**
   * Reset metrics (for testing)
   */
  public resetMetrics(): void {
    this.shownCount = 0;
    this.clickedCount = 0;
    this.bookedCount = 0;
    this.events = [];
  }
}

// Export singleton instance
export const calendlyService = CalendlyService.getInstance();
