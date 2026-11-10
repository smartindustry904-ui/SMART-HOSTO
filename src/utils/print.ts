/**
 * SmartHosto SIH - Isolated Print Utility
 * Provides 100% airtight, clean printing for receipts, tickets, and official A4 medical documents.
 * Prints directly via an isolated invisible iframe to prevent any background dashboard/sidebar bleeding.
 */

export interface PrintOptions {
  format?: 'THERMAL_80MM' | 'A4';
  title?: string;
  onAfterPrint?: () => void;
}

export const printElementDirectly = (
  elementId: string,
  options: PrintOptions = {}
): void => {
  const { format = 'THERMAL_80MM', title = 'Document SmartHosto', onAfterPrint } = options;

  const sourceElement = document.getElementById(elementId);
  if (!sourceElement) {
    console.warn(`[SmartHosto Print] Element with ID "${elementId}" not found. Falling back to native print.`);
    window.print();
    if (onAfterPrint) onAfterPrint();
    return;
  }

  // Remove any previously leftover print frames
  const oldFrame = document.getElementById('smarthosto-print-isolated-frame');
  if (oldFrame) {
    oldFrame.remove();
  }

  // Create an invisible iframe for complete DOM and CSS isolation
  const iframe = document.createElement('iframe');
  iframe.id = 'smarthosto-print-isolated-frame';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-9999';

  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    console.warn('[SmartHosto Print] Could not access iframe document. Falling back to native print.');
    window.print();
    if (onAfterPrint) onAfterPrint();
    return;
  }

  // Extract all stylesheets and style rules from parent document
  let stylesHtml = '';
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    // Exclude existing print modals styles to avoid recursive style collisions
    if (!node.textContent?.includes('ticket-modal-backdrop')) {
      stylesHtml += node.outerHTML + '\n';
    }
  });

  // Dedicated clean page rules
  const thermalStyles = `
    @page {
      size: 80mm auto !important;
      margin: 0 !important;
    }
    html, body {
      width: 80mm !important;
      max-width: 80mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: 'Courier New', Courier, monospace !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    #thermal-receipt {
      width: 76mm !important;
      max-width: 76mm !important;
      margin: 0 auto !important;
      padding: 2mm 1mm !important;
      border: none !important;
      box-shadow: none !important;
      background: #ffffff !important;
      color: #000000 !important;
    }
    .no-print {
      display: none !important;
    }
  `;

  const a4Styles = `
    @page {
      size: A4 portrait !important;
      margin: 8mm 10mm !important;
    }
    html, body {
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    #a4-receipt {
      width: 100% !important;
      max-width: 190mm !important;
      margin: 0 auto !important;
      padding: 0 !important;
      border: none !important;
      box-shadow: none !important;
      background: #ffffff !important;
      color: #000000 !important;
    }
    .no-print {
      display: none !important;
    }
  `;

  const chosenPageStyles = format === 'THERMAL_80MM' ? thermalStyles : a4Styles;

  // Clone source HTML
  const contentHtml = sourceElement.outerHTML;

  // Build clean HTML document inside iframe
  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <script src="https://cdn.tailwindcss.com"></script>
      ${stylesHtml}
      <style>
        ${chosenPageStyles}
      </style>
    </head>
    <body class="bg-white text-black p-0 m-0">
      ${contentHtml}
    </body>
    </html>
  `);
  iframeDoc.close();

  // Give Tailwind and fonts a moment to layout, then open print dialog
  const printTriggerTimeout = setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('[SmartHosto Print] Error invoking print on iframe:', err);
      window.print();
    } finally {
      if (onAfterPrint) onAfterPrint();
      // Remove iframe from DOM after print sequence completes
      setTimeout(() => {
        iframe.remove();
      }, 3000);
    }
  }, 350);

  // Fallback cleanup if printTriggerTimeout fails
  iframe.onerror = () => {
    clearTimeout(printTriggerTimeout);
    iframe.remove();
    window.print();
    if (onAfterPrint) onAfterPrint();
  };
};
