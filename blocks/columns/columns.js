import { readBlockConfig } from '../../scripts/aem.js';

function embedYoutube(url, autoplay, background) {
  const usp = new URLSearchParams(url.search);
  let suffix = '';
  if (background || autoplay) {
    const suffixParams = {
      autoplay: autoplay ? '1' : '0',
      mute: background ? '1' : '0',
      controls: background ? '0' : '1',
      disablekb: background ? '1' : '0',
      loop: background ? '1' : '0',
      playsinline: background ? '1' : '0',
    };
    suffix = `&${Object.entries(suffixParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  }
  let vid = usp.get('v') ? encodeURIComponent(usp.get('v')) : '';
  const embed = url.pathname;
  if (url.origin.includes('youtu.be')) {
    [, vid] = url.pathname.split('/');
  }

  const temp = document.createElement('div');
  temp.innerHTML = `<div style="left: 0; width: 100%; height: 0; position: relative; padding-bottom: 56.25%;">
      <iframe src="https://www.youtube.com${vid ? `/embed/${vid}?rel=0&v=${vid}${suffix}` : embed}" style="border: 0; top: 0; left: 0; width: 100%; height: 100%; position: absolute;" 
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope; picture-in-picture" allowfullscreen="" scrolling="no" title="Content from Youtube" loading="lazy"></iframe>
    </div>`;
  return temp.children.item(0);
}

function getVideoElement(source, autoplay, background) {
  const video = document.createElement('video');
  video.setAttribute('controls', '');
  if (autoplay) video.setAttribute('autoplay', '');
  if (background) {
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.removeAttribute('controls');
    video.addEventListener('canplay', () => {
      video.muted = true;
      if (autoplay) video.play();
    });
  }

  const sourceEl = document.createElement('source');
  sourceEl.setAttribute('src', source);
  sourceEl.setAttribute('type', 'video/mp4');
  video.append(sourceEl);

  return video;
}

/** Button style values from action-button model (live output can be plain p tags) */
const ACTION_BUTTON_STYLES = ['default-button', 'default-button-secondary', 'default-button-link', 'default-button-dark'];

/** True if el is a placeholder button output from publish (shows # and duplicates real button built from p tags) */
function isPlaceholderButtonContainer(el) {
  if (el.tagName !== 'P' || !el.classList.contains('button-container')) return false;
  const a = el.querySelector('a.button');
  if (!a) return false;
  const href = (a.getAttribute('href') || '').trim();
  const title = (a.getAttribute('title') || '').trim();
  const text = (a.textContent || '').trim();
  return (href === '#' || href === '') && (title === '#' || title === '') && (text === '#' || text === '');
}

/** Mobile-app values an action button also carries; the web button has no use for them. */
const MOBILE_VARIANTS = ['contained', 'contained-tonal', 'outlined', 'text', 'elevated'];
const WEB_ALIGNMENTS = ['left', 'center', 'right'];

/** A custom mobile style row: key:value pairs, comma separated, no spaces (width:200,fontSize:12). */
function isCustomStyleRow(text) {
  return /^[A-Za-z][\w-]*:[^,\s]+(,[A-Za-z][\w-]*:[^,\s]+)*$/.test(text);
}

/** A free-text web event type, as opposed to one of the mobile-only values that can follow it. */
function isWebEventType(text) {
  return !!text
    && !MOBILE_VARIANTS.includes(text)
    && !WEB_ALIGNMENTS.includes(text.toLowerCase())
    && text !== 'stretch'
    && !text.includes(':');
}

/**
 * Reads the rows that follow an action button's link. Empty fields are left out of the live output,
 * so rows are identified by what they hold and not by their position: label and title come first,
 * then a web style, a web alignment and a web event type if they were authored. What follows is
 * mobile-only (variant, alignment, event type, icon, message, custom style) and ends at the custom
 * style row, the model's last field, so a paragraph placed after the button stays page content.
 * Without a custom style row only the recognisable mobile values (variant, alignment) are taken,
 * because an icon, message or event type is plain text and cannot be told from page copy.
 * @param {string[]} rows Text of the paragraphs after the link
 * @returns {{label: number, title: number, style?: number, alignment?: number, eventType?: number,
 *   consumed: number}|null} Row indexes by field and how many rows belong to the button, or null
 *   when there are too few rows to be a button
 */
export function readActionButtonRows(rows) {
  if (rows.length < 2) return null;
  const fields = { label: 0, title: 1 };
  let next = 2;
  if (next < rows.length && ACTION_BUTTON_STYLES.includes(rows[next])) {
    fields.style = next;
    next += 1;
  }
  if (next < rows.length && WEB_ALIGNMENTS.includes(rows[next].toLowerCase())) {
    fields.alignment = next;
    next += 1;
  }
  if (next < rows.length && isWebEventType(rows[next])) {
    fields.eventType = next;
    next += 1;
  }

  // Mobile-only rows: through the custom style row if there is one, else just the known values.
  const customStyle = rows.findIndex((row, index) => index >= next && isCustomStyleRow(row));
  if (customStyle >= 0) {
    next = customStyle + 1;
  } else {
    if (next < rows.length && MOBILE_VARIANTS.includes(rows[next])) next += 1;
    if (next < rows.length && (WEB_ALIGNMENTS.includes(rows[next].toLowerCase()) || rows[next] === 'stretch')) {
      next += 1;
    }
  }
  fields.consumed = next;
  return fields;
}

/**
 * True for the paragraph that holds an action button's Link field: only a link, whose text is the
 * authored path (a friendly link text in running copy is never mistaken for a button).
 */
function isActionButtonLink(el) {
  if (el.tagName !== 'P' || el.children.length !== 1) return false;
  const a = el.querySelector(':scope > a[href]');
  if (!a) return false;
  const text = (a.textContent || '').trim();
  if ((el.textContent || '').trim() !== text) return false;
  return text.startsWith('/content/') || text === a.getAttribute('href') || text === a.href;
}

/**
 * On live, action buttons in columns arrive as plain <p> tags, in model order, with every empty
 * field left out: link, label, title, then whichever of style, alignment, event type and the
 * mobile fields were authored. Each button starts at its link paragraph and runs to the next link
 * (or the end of the column), so that:
 * - the link goes into the button, so it points where it should
 * - label, title, and any web style, alignment and event type are read by value
 * - the mobile-only rows are dropped, instead of showing as stray text
 * Buttons delivered without a link (label, title, style only) are still wrapped as before.
 * Placeholder "#" buttons from publish are removed first.
 * @param {Element} col Column element
 * @returns {Element[]} Newly created action-button block elements
 */
function normalizeLiveActionButtonsInColumn(col) {
  // Remove broken placeholder buttons from publish so we don't show "#" or duplicate the real button
  [...col.children].forEach((child) => {
    if (isPlaceholderButtonContainer(child)) child.remove();
  });

  const created = [];

  const children = [...col.children];
  let i = 0;
  while (i < children.length) {
    if (!isActionButtonLink(children[i])) {
      i += 1;
    } else {
      const link = children[i];
      const rows = [];
      let j = i + 1;
      while (j < children.length && children[j].tagName === 'P' && !isActionButtonLink(children[j])) {
        rows.push(children[j]);
        j += 1;
      }
      const fields = readActionButtonRows(rows.map((row) => (row.textContent || '').trim()));
      if (fields) {
        const wrapper = document.createElement('div');
        wrapper.className = 'action-button';
        col.insertBefore(wrapper, link);
        wrapper.append(link);
        const props = {
          label: 'label', title: 'title', style: 'style', alignment: 'alignment', eventType: 'buttoneventtype',
        };
        // Rows past the button's last field are page content and stay where they are
        rows.slice(0, fields.consumed).forEach((row, index) => {
          const field = Object.keys(props).find((name) => fields[name] === index);
          if (field) {
            row.setAttribute('data-aue-prop', props[field]);
            wrapper.append(row);
          } else {
            row.remove();
          }
        });
        created.push(wrapper);
      }
      i = j;
    }
  }

  // Buttons delivered without a link: consecutive <p> label, title, style
  const rest = [...col.children];
  i = 0;
  while (i <= rest.length - 3) {
    const a = rest[i];
    const b = rest[i + 1];
    const c = rest[i + 2];
    const styleText = (c.textContent || '').trim();
    if (a.tagName === 'P' && b.tagName === 'P' && c.tagName === 'P' && ACTION_BUTTON_STYLES.includes(styleText)) {
      const wrapper = document.createElement('div');
      wrapper.className = 'action-button';
      a.setAttribute('data-aue-prop', 'label');
      b.setAttribute('data-aue-prop', 'title');
      c.setAttribute('data-aue-prop', 'style');
      col.insertBefore(wrapper, a);
      wrapper.append(a, b, c);
      created.push(wrapper);
      i += 3;
    } else {
      i += 1;
    }
  }
  return created;
}

const loadVideoEmbed = (block, link, autoplay, background) => {
  const isYoutube = link.includes('youtube') || link.includes('youtu.be');
  if (isYoutube) {
    const url = new URL(link);
    const embedWrapper = embedYoutube(url, autoplay, background);
    block.append(embedWrapper);
    embedWrapper.querySelector('iframe').addEventListener('load', () => {
      block.dataset.embedLoaded = true;
    });
  } else {
    const videoEl = getVideoElement(link, autoplay, background);
    block.append(videoEl);
    videoEl.addEventListener('canplay', () => {
      block.dataset.embedLoaded = true;
    });
  }
};

function isVideoLink(link) {
    try {
        if (!link) return false;
        // Check for regular video files
        const regularVideoCheck = link.match(/\.(mp4|mov|wmv|avi|mkv|webm)$/i) !== null;

        // Check for YouTube URLs
        const youtubeCheck = (
          link.includes('youtube.com') ||
          link.includes('youtu.be') ||
          link.includes('youtube-nocookie.com')
        );

        // Combined check
        const isVideo = regularVideoCheck || youtubeCheck;

        // Log the type of video for debugging
        if (isVideo) {
            console.log('Video type:', {
                isRegularVideo: regularVideoCheck,
                isYouTube: youtubeCheck,
                url: link
            });
        }

        return isVideo;

    } catch (error) {
        console.error('Error checking video link:', error);
        return false;
    }
}

// Process a single column for alignment
function processColumnAlignment(col) {
  // Skip if already processed
  if (col._alignmentProcessed) {
    return;
  }
  
  // Ensure column has proper UE attributes for recognition and + icon functionality
  // These attributes are CRITICAL for UE to show the + icon and allow adding child components
  if (!col.hasAttribute('data-aue-model')) {
    col.setAttribute('data-aue-model', 'column');
  }
  if (!col.hasAttribute('data-aue-type')) {
    col.setAttribute('data-aue-type', 'component');
  }
  // CRITICAL: data-aue-filter tells UE what components can be added as children
  if (!col.hasAttribute('data-aue-filter')) {
    col.setAttribute('data-aue-filter', 'column');
  }
  // data-aue-behavior helps UE recognize this as a container component
  if (!col.hasAttribute('data-aue-behavior')) {
    col.setAttribute('data-aue-behavior', 'component');
  }
  
  // Try to find alignment value in column structure
  // Check multiple possible locations where AEM might store it
  let alignmentDiv = col.querySelector('[data-aue-prop="itemAlignment"]');
  
  // Also check if it's a direct child div or p tag
  if (!alignmentDiv) {
    // Check if any direct child has the data-aue-prop
    alignmentDiv = Array.from(col.children).find(child => 
      child.hasAttribute('data-aue-prop') && 
      child.getAttribute('data-aue-prop') === 'itemAlignment'
    );
  }
  
  // Also check for p tag with data-aue-prop (like tabs block does)
  if (!alignmentDiv) {
    const alignmentP = col.querySelector('p[data-aue-prop="itemAlignment"]');
    if (alignmentP) {
      alignmentDiv = alignmentP.parentElement || alignmentP;
    }
  }
  
  // Helper to read alignment from column element attributes (AEM may store only on the node)
  const getAlignmentFromColumnAttrs = () => {
    const v = col.getAttribute('itemAlignment') ||
             col.getAttribute('data-itemAlignment') ||
             col.getAttribute('data-itemalignment') ||
             col.getAttribute('data-item-alignment') ||
             col.dataset?.itemAlignment ||
             col.dataset?.itemalignment ||
             col.getAttribute('itemalignment');
    if (!v) return null;
    const s = String(v).toLowerCase().trim();
    return (s === 'horizontal' || s === 'vertical') ? s : (s.includes('horiz') ? 'horizontal' : 'vertical');
  };

  // When no alignment div in DOM yet (e.g. column just created, UE injects field later)
  if (!alignmentDiv) {
    const alignmentFromAttr = getAlignmentFromColumnAttrs();
    col.classList.remove('columns-item-horizontal', 'columns-item-vertical');
    col.classList.add(alignmentFromAttr === 'horizontal' ? 'columns-item-horizontal' : 'columns-item-vertical');
    // Schedule re-checks so we pick up itemAlignment once UE injects it (new columns get created before the field exists)
    const delays = [200, 500, 1000, 1500];
    delays.forEach((delay) => {
      setTimeout(() => {
        if (!col.isConnected) return;
        const nowDiv = col.querySelector('[data-aue-prop="itemAlignment"]');
        if (nowDiv) {
          col._alignmentProcessed = false;
          processColumnAlignment(col);
        }
      }, delay);
    });
    col._alignmentProcessed = true;
    col._alignmentProcessedWithoutDiv = true; // so UE event handler can re-run processColumnAlignment for this column
    return;
  }
  
  // Function to update alignment classes based on current value
  const updateAlignment = () => {
    // Re-find alignmentDiv in case it was replaced by UE
    let currentAlignmentDiv = col.querySelector('[data-aue-prop="itemAlignment"]');
    if (!currentAlignmentDiv) {
      currentAlignmentDiv = alignmentDiv; // Fallback to original
    }
    
    // Read the alignment value - following the EXACT pattern from tabs block
    // Tabs uses: block.querySelector('p[data-aue-prop="tabsstyle"]')?.textContent?.trim()
    let alignmentValue = 'vertical'; // default
    
    // FIRST: Check for p tag with data-aue-prop (EXACT pattern from tabs block - most reliable)
    const alignmentP = col.querySelector('p[data-aue-prop="itemAlignment"]');
    if (alignmentP) {
      alignmentValue = alignmentP.textContent?.trim() || alignmentP.innerText?.trim() || 'vertical';
    }
    
    // SECOND: Check data-aue-value / value on the alignment element (UE may store select value in attribute)
    if ((!alignmentValue || alignmentValue === 'vertical') && currentAlignmentDiv) {
      const attrValue = currentAlignmentDiv.getAttribute('data-aue-value') ||
                        currentAlignmentDiv.getAttribute('data-value') ||
                        currentAlignmentDiv.getAttribute('value') ||
                        currentAlignmentDiv.dataset?.value ||
                        currentAlignmentDiv.getAttribute('itemAlignment');
      if (attrValue) {
        alignmentValue = String(attrValue).toLowerCase().trim();
      }
    }
    
    // THIRD: If not found, check the alignment div text content (fallback)
    if ((!alignmentValue || alignmentValue === 'vertical') && currentAlignmentDiv) {
      const alignmentPInDiv = currentAlignmentDiv.querySelector('p[data-aue-prop="itemAlignment"]') ||
                              currentAlignmentDiv.querySelector('p');
      if (alignmentPInDiv) {
        alignmentValue = alignmentPInDiv.textContent?.trim() || alignmentPInDiv.innerText?.trim() || 'vertical';
      } else {
        alignmentValue = currentAlignmentDiv.textContent?.trim() || currentAlignmentDiv.innerText?.trim() || 'vertical';
      }
    }
    
    // FOURTH: Check if value is stored directly on the column div as an attribute (AEM fallback)
    if (!alignmentValue || alignmentValue === 'vertical') {
      const colAttrValue = col.getAttribute('itemAlignment') ||
                           col.getAttribute('data-itemAlignment') ||
                           col.getAttribute('data-itemalignment') ||
                           col.dataset?.itemAlignment ||
                           col.dataset?.itemalignment ||
                           col.getAttribute('itemalignment');
      if (colAttrValue) {
        alignmentValue = String(colAttrValue).toLowerCase().trim();
      }
    }
    
    // Normalize the value - handle case-insensitive matching
    alignmentValue = alignmentValue.toLowerCase().trim();
    if (alignmentValue !== 'horizontal' && alignmentValue !== 'vertical') {
      // Try to match common variations
      if (alignmentValue.includes('horiz') || alignmentValue === 'h' || alignmentValue === 'row') {
        alignmentValue = 'horizontal';
      } else {
        alignmentValue = 'vertical';
      }
    }
    
    // Remove both classes first
    col.classList.remove('columns-item-horizontal', 'columns-item-vertical');
    
    // Apply the correct class based on current value
    if (alignmentValue === 'horizontal') {
      col.classList.add('columns-item-horizontal');
    } else {
      col.classList.add('columns-item-vertical');
    }
  };
  
  // Initial alignment update
  updateAlignment();
  
  // Hide the alignment config div (but keep it in DOM for UE)
  // Use multiple methods to ensure it's hidden
  alignmentDiv.style.display = 'none';
  alignmentDiv.style.visibility = 'hidden';
  alignmentDiv.style.height = '0';
  alignmentDiv.style.overflow = 'hidden';
  alignmentDiv.setAttribute('data-aue-hidden', 'true');
  
  // Also hide any p tags inside
  const alignmentP = alignmentDiv.querySelector('p');
  if (alignmentP) {
    alignmentP.style.display = 'none';
    alignmentP.style.visibility = 'hidden';
    alignmentP.style.height = '0';
  }
  
  // Set up MutationObserver to watch for changes to the alignment field
  // This ensures the classes update when the user changes the value in UE
  if (!col._alignmentObserver) {
    const observer = new MutationObserver(() => {
      // Always update when any mutation occurs
      updateAlignment();
    });
    
    // Observe the alignment div and its children for ALL changes
    observer.observe(alignmentDiv, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeOldValue: false
    });
    
    // Also observe the column itself in case UE replaces the alignmentDiv
    observer.observe(col, {
      childList: true,
      subtree: false
    });
    
    col._alignmentObserver = observer;
    col._updateAlignment = updateAlignment; // Store reference for UE events
    
    // Also set up a periodic check as a fallback (every 300ms when in author mode)
    // This catches cases where MutationObserver might miss changes
    if (document.documentElement.classList.contains('adobe-ue-edit')) {
      col._alignmentInterval = setInterval(() => {
        // Re-find alignmentDiv in case it was replaced
        const currentDiv = col.querySelector('[data-aue-prop="itemAlignment"]');
        if (currentDiv && currentDiv !== alignmentDiv) {
          // Alignment div was replaced, update our reference and re-observe
          alignmentDiv = currentDiv;
          observer.disconnect();
          observer.observe(alignmentDiv, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeOldValue: false
          });
          observer.observe(col, {
            childList: true,
            subtree: false
          });
          // Re-hide the new div
          alignmentDiv.style.display = 'none';
          alignmentDiv.style.visibility = 'hidden';
          alignmentDiv.style.height = '0';
          alignmentDiv.style.overflow = 'hidden';
          alignmentDiv.setAttribute('data-aue-hidden', 'true');
        }
        updateAlignment();
      }, 300);
    }
  }
  
  // Cleanup function to remove interval when column is removed
  if (col._cleanupAlignment) {
    col._cleanupAlignment();
  }
  col._cleanupAlignment = () => {
    if (col._alignmentInterval) {
      clearInterval(col._alignmentInterval);
      col._alignmentInterval = null;
    }
    if (col._alignmentObserver) {
      col._alignmentObserver.disconnect();
      col._alignmentObserver = null;
    }
  };
  
  // Mark as processed
  col._alignmentProcessed = true;
}

function parseWidthsValue(rawValue) {
  if (!rawValue) return null;
  const parts = String(rawValue)
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0 && n <= 100);
  return parts.length > 0 ? parts : null;
}

function parseColumnWidths(block, config = {}) {
  const raw = config.columnwidths
    || config.columnWidths
    || config['column-widths']
    || block.querySelector('p[data-aue-prop="columnWidths"]')?.textContent?.trim()
    || block.querySelector('[data-aue-prop="columnWidths"]')?.textContent?.trim()
    || block.getAttribute('data-column-widths')
    || block.dataset?.columnWidths
    || '';
  return parseWidthsValue(raw);
}

function applyColumnWidths(block, rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return;
  const trimmed = rawValue.trim();
  if (!trimmed) return;
  block.dataset.columnWidths = trimmed;
  const widths = parseWidthsValue(trimmed);
  if (!widths || widths.length === 0) return;
  [...block.children].forEach((row) => {
    if (!row.classList.contains('columns-row')) return;
    [...row.children].forEach((col, colIndex) => {
      if (widths[colIndex] != null) {
        const pct = widths[colIndex];
        col.style.flex = `0 0 ${pct}%`;
        col.style.maxWidth = `${pct}%`;
      }
    });
  });
}

export default async function decorate(block) {
  // Prevent re-decoration
  if (block.dataset.decorated === 'true') {
    return;
  }

  const config = readBlockConfig(block) || {};
  const cols = [...block.firstElementChild.children];
  block.classList.add(`columns-${cols.length}-cols`);

  // Get block index for ID generation
  const allColumnsBlocks = document.querySelectorAll('.columns');
  const blockIndex = Array.from(allColumnsBlocks).indexOf(block);
  
  let contentCounter = 0;

  const columnWidths = parseColumnWidths(block, config);

  /** Action-button blocks created from live "p,p,p" pattern; decorate and load after column loop */
  const actionButtonBlocksToLoad = [];

  // setup image columns
  [...block.children].forEach((row) => {
    row.classList.add('columns-row');
    [...row.children].forEach((col, colIndex) => {
      // Normalize live action-button content (consecutive p label/title/style) so it can be decorated
      actionButtonBlocksToLoad.push(...normalizeLiveActionButtonsInColumn(col));

      if (columnWidths && columnWidths[colIndex] != null) {
        const pct = columnWidths[colIndex];
        col.style.flex = `0 0 ${pct}%`;
        col.style.maxWidth = `${pct}%`;
      }
      // Process alignment for this column
      processColumnAlignment(col);

      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          // picture is only content in column
          picWrapper.classList.add('columns-img-col');
        }
      }
     // const videoBlock = col.querySelector('div[data-aue-model="video"]');

      const linkavl = col.querySelector('a')?.href;
      const videoBlock = linkavl ? isVideoLink(linkavl) : false;
      
      if (videoBlock) {
        const videoWrapper = col.closest('div');
        if (videoWrapper) {
          // Add video specific classes
          videoWrapper.classList.add('columns-video-col');
          
          // Get video link from button container
          const videoLink = col.querySelector('a');
          if (videoLink) {
            const videoUrl = videoLink.getAttribute('href');
            
            // Create video container
            const videoContainer = document.createElement('div');
            videoContainer.className = 'columns-video-container';
            
            // Load video with appropriate embed
            loadVideoEmbed(
              videoContainer, 
              videoUrl,
              col.dataset.autoplay === 'true',
              col.dataset.background === 'true'
            );

            // Replace button container with video container
            const buttonContainer = videoLink.closest('div');
            if (buttonContainer) {
              buttonContainer.replaceWith(videoContainer);
            }
          }
        }
      }

      // Check for text content (paragraphs or headings)
      const textContent = col.querySelector('p, h1, h2, h3, h4, h5, h6');
      if (textContent && !pic) {  // Only add if no picture (avoid double counting)
        const textBlock = textContent.closest('div');
        if (textBlock) {
          textBlock.setAttribute('data-text-block-index', contentCounter);
          contentCounter++;
        }
      }
    });
  });

  // Decorate and load action-button blocks created from live p-tag pattern (author already has div.action-button)
  if (actionButtonBlocksToLoad.length > 0) {
    const { decorateBlock, loadBlock } = await import('../../scripts/aem.js');
    for (const actionButtonBlock of actionButtonBlocksToLoad) {
      decorateBlock(actionButtonBlock);
      await loadBlock(actionButtonBlock);
    }
  }

  // Mark block as decorated
  block.dataset.decorated = 'true';

  // Listen for UE events to process new columns when they're added
  if (!block._ueListenerAdded) {
    // When user changes Item Alignment in the properties panel, UE sends aue:content-patch;
    // the DOM may not be updated with the new value, so apply alignment directly from the payload.
    const handleContentPatch = (event) => {
      const patch = event.detail?.patch;
      if (!patch || patch.name !== 'itemAlignment') return;
      const resource = event.detail?.request?.target?.resource;
      const blockResource = block.getAttribute('data-aue-resource');
      if (!resource || !blockResource || !resource.startsWith(blockResource)) return;

      let col = event.target?.closest?.('[data-aue-model="column"]') || null;
      if (!col && resource) {
        col = block.querySelector(`[data-aue-resource="${resource}"]`) || null;
      }
      if (!col) {
        block.querySelectorAll('[data-aue-model="column"]').forEach((c) => {
          if (c.getAttribute?.('data-aue-resource') === resource) col = c;
        });
      }
      if (col) {
        const val = String(patch.value || '').toLowerCase().trim();
        const alignment = (val === 'horizontal' || val === 'vertical') ? val : 'vertical';
        col.classList.remove('columns-item-horizontal', 'columns-item-vertical');
        col.classList.add(alignment === 'horizontal' ? 'columns-item-horizontal' : 'columns-item-vertical');
      } else {
        // Column may not have data-aue-resource; re-run alignment after a delay so DOM or updateAlignment can pick it up
        setTimeout(() => {
          block.querySelectorAll('[data-aue-model="column"]').forEach((c) => {
            if (c._updateAlignment) c._updateAlignment();
            else processColumnAlignment(c);
          });
        }, 150);
      }
    };

    const handleContentDetails = (event) => {
      const resource = event.detail?.request?.target?.resource;
      const blockResource = block.getAttribute('data-aue-resource');
      if (!resource || !blockResource || resource !== blockResource) return;
      const content = event.detail?.content;
      if (content && content.columnWidths != null && content.columnWidths !== '') {
        applyColumnWidths(block, String(content.columnWidths));
      }
    };

    const handleUEEvent = (event) => {
      const resource = event.detail?.request?.target?.resource;
      const blockResource = block.getAttribute('data-aue-resource');

      if (event.type === 'aue:content-details') {
        handleContentDetails(event);
      }

      if (event.type === 'aue:content-patch' && event.detail?.patch?.name === 'columnWidths') {
        if (resource && blockResource && resource === blockResource) {
          applyColumnWidths(block, String(event.detail.patch.value || ''));
        }
        return;
      }

      if (event.type === 'aue:content-patch' && event.detail?.patch?.name === 'itemAlignment') {
        handleContentPatch(event);
        return;
      }

      if (resource && blockResource && resource.startsWith(blockResource)) {
        // Run soon and again later so new columns get alignment once UE injects itemAlignment
        [100, 400, 800].forEach((delay) => {
          setTimeout(() => {
            [...block.children].forEach((row) => {
              [...row.children].forEach((col) => {
                if (!col.hasAttribute('data-aue-model')) {
                  col.setAttribute('data-aue-model', 'column');
                }
                if (!col.hasAttribute('data-aue-type')) {
                  col.setAttribute('data-aue-type', 'component');
                }
                if (!col.hasAttribute('data-aue-filter')) {
                  col.setAttribute('data-aue-filter', 'column');
                }
                if (!col.hasAttribute('data-aue-behavior')) {
                  col.setAttribute('data-aue-behavior', 'component');
                }
                if (col._alignmentProcessedWithoutDiv) {
                  col._alignmentProcessed = false;
                  col._alignmentProcessedWithoutDiv = false;
                }
                if (col._alignmentProcessed && col._updateAlignment) {
                  col._updateAlignment();
                } else {
                  // Re-process so columns created before UE injects itemAlignment get the style on a later pass
                  processColumnAlignment(col);
                }
              });
            });
          }, delay);
        });
      }
    };

    const main = document.querySelector('main');
    if (main) {
      main.addEventListener('aue:content-add', handleUEEvent);
      main.addEventListener('aue:content-update', handleUEEvent);
      main.addEventListener('aue:content-patch', handleUEEvent);
      main.addEventListener('aue:content-details', handleContentDetails);
    }

    block._ueListenerAdded = true;
  }

  // Add IDs to headings and paragraphs with container context
  ['h1', 'h2', 'h3', 'h4', 'h5', 'h6','p'].forEach((tag) => {
    const elements = block.querySelectorAll(tag);
    elements.forEach((el) => {
      const textBlock = el.closest('[data-text-block-index]');
      const textBlockIndex = textBlock ? textBlock.getAttribute('data-text-block-index') : 'unknown';
      
      // Count this tag within its text block
      const textBlockElements = textBlock ? textBlock.querySelectorAll(tag) : [el];
      const tagIndex = Array.from(textBlockElements).indexOf(el);
      
      el.id = `columns_${blockIndex}_text_${textBlockIndex}_${tag}_${tagIndex}`;
    });
  });
}
