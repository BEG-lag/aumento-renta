/**
 * Shape of the bundled index data (data/inpc.json and data/udis.json).
 * Both files are written by scripts/update-data.ts from official sources and
 * keep their source metadata next to the values.
 */

/** A note published in the Diario Oficial de la Federación. */
export interface DofRef {
  /** Publication date in the DOF, "YYYY-MM-DD". */
  date: string;
  /** SIDOF note id (codNota). The public page is dof.gob.mx/nota_detalle.php?codigo=... */
  note: number;
}

export interface SourceInfo {
  id: string;
  name: string;
  url: string;
  /** What was taken from this source. */
  note: string;
  /** Date the source was last read by the update script, "YYYY-MM-DD". */
  consulted: string;
}

export interface InpcMonth {
  /** "YYYY-MM" */
  month: string;
  /** Index value exactly as published, as a decimal string. */
  value: string;
  /** Where the value comes from: the DOF publication or the INEGI open-data file. */
  source: 'dof' | 'inegi-csv';
  /** The DOF publication that announced this month (from August 2018). */
  dof?: DofRef;
  /** A later DOF "Nota aclaratoria" that corrected the published value (August 2018). */
  correction?: DofRef;
}

export interface InpcData {
  schema: 1;
  series: string;
  base: string;
  /** Last month added or changed, "YYYY-MM-DD". */
  updated: string;
  sources: SourceInfo[];
  months: InpcMonth[];
}

/** One Banco de México publication of daily UDI values in the DOF. */
export interface UdiPublication extends DofRef {
  /** First and last day covered, "YYYY-MM-DD". */
  from: string;
  to: string;
}

export interface UdisData {
  schema: 1;
  series: string;
  updated: string;
  sources: SourceInfo[];
  /** Date of values[0], "YYYY-MM-DD". One value per calendar day, no gaps. */
  start: string;
  /** Date of the last value, "YYYY-MM-DD". */
  end: string;
  /** UDI values in pesos, exactly as published (6 decimals). */
  values: string[];
  /** DOF publications for recent periods (from 2018). */
  publications: UdiPublication[];
}
