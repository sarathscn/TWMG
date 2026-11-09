// Facts the legal pages depend on. The operator must fill in the two blank values before relying on the pages:
// they are left empty on purpose, because a contact address or governing law must not be made up.
export const legal={operator:'Sarath Chandran C',service:'TWMG (The Way Money Goes)',updated:'9 November 2026',contactEmail:'',governingLaw:''};
export const contactLine=()=>legal.contactEmail||'[Contact email to be added by the operator]';
export const lawLine=()=>legal.governingLaw||'[Governing law and courts to be added by the operator]';
