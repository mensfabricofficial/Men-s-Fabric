/**
 * Dedicated high-reliability print helper for invoices and receipts
 * Works across desktop, mobile web, sandboxed iframes, and modern browsers
 */
export const printElementById = (elementId: string, documentTitle: string = 'Invoice'): void => {
  const targetElement = document.getElementById(elementId);
  if (!targetElement) {
    if (typeof window !== 'undefined') {
      window.print();
    }
    return;
  }

  try {
    // Remove any leftover print iframes
    const oldIframe = document.getElementById('mf-dedicated-print-frame');
    if (oldIframe) {
      oldIframe.remove();
    }

    // Create an invisible iframe attached to body
    const iframe = document.createElement('iframe');
    iframe.id = 'mf-dedicated-print-frame';
    iframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;');
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    if (!frameDoc) {
      window.print();
      return;
    }

    // Collect all stylesheets and style blocks from the main document
    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((tag) => tag.outerHTML)
      .join('\n');

    frameDoc.open();
    frameDoc.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${documentTitle}</title>
          ${styleTags}
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            html, body {
              background: #ffffff !important;
              color: #000000 !important;
              margin: 0 !important;
              padding: 0 !important;
              font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .print\\:hidden, button {
              display: none !important;
            }
            #${elementId} {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              padding: 5mm !important;
              display: block !important;
              visibility: visible !important;
            }
          </style>
        </head>
        <body>
          <div id="${elementId}">
            ${targetElement.innerHTML}
          </div>
        </body>
      </html>
    `);
    frameDoc.close();

    // Give iframe time to load images and fonts
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Iframe print failed, falling back to window.print():', err);
        window.print();
      } finally {
        // Clean up iframe after 2 seconds
        setTimeout(() => {
          const frame = document.getElementById('mf-dedicated-print-frame');
          if (frame) frame.remove();
        }, 2000);
      }
    }, 400);
  } catch (err) {
    console.warn('Dedicated print error, falling back:', err);
    window.print();
  }
};
