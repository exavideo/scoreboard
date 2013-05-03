#include <avr/io.h>
#include <avr/interrupt.h>
#include <stdint.h>

uint16_t rx_reg;
int bits;

/* start bit detected */
ISR(INT0_vect) {
	/* start timer for bit capture */
	TCCR0A = 0x02;
	TCCR0B = 0x02;
	TCNT0 = 0;
	PORTD |= 0x40;
	OCR0A = 40;	// 40 cycles = 20 usec
	EIMSK = 0;	// disable start bit interrupt
	rx_reg = 0;
	bits = 9;
	PORTD &= ~0x40;
	TIFR0 |= 0x02; // clear any stale IRQ flags
	TIMSK0 = 0x02; // enable timer interrupt
}

/* time to sample a bit */
ISR(TIMER0_COMPA_vect) {
	OCR0A = 32;
	PORTD |= 0x80;
	rx_reg >>= 1;
	if (PIND & 0x04) {
		rx_reg |= 0x100;
	}
	PORTD &= ~0x80;
	
	if (--bits == 0) {
		/* 
		 * receive finished
		 * we must clear the edge interrupt flag here, or else
		 * the INT0 isr will execute again immediately due to the
		 * falling edges during the data byte.
		 */
		EIFR |= 0x01;
		EIMSK = 0x01;	// enable start bit interrupt
		TIMSK0 = 0x00;	// disable timer interrupt
		/* send low 8 bits out main UART */
		if ((UCSR0A & 0x20) != 0) {
			UDR0 = (uint8_t) rx_reg;
		}
	}
}

int main(void) {
	/* UART setup */
	UCSR0A = 0x02;	// 2X mode
	UCSR0C = 0x06;	// 8 data bits
	UBRR0H = 0;	// (see datasheet table 20-7)
	UBRR0L = 16;	// ~115.2kbaud
	UCSR0B = 0x08;	// enable transmit

	/* signal is coming in at PD2 (INT0) */
	DDRD = 0xc0;	// PD7 = output, remaining = input
	PORTD |= 0x04;	// PD2 pullup enabled
	EICRA = 0x0a;	// external interrupts on falling edge
	EIMSK |= 0x01;	// enable interrupt 0

	sei( );

	for (;;) ;

}


