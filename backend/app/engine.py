# ==========================================
# backend/app/engine.py
# The Stateless Decision Engine
# ==========================================

from typing import Dict, Any, Optional

def generate_recommendation(
    execution_pct: float, 
    quality_status: str, 
    highest_remark_severity: Optional[str], 
    policy_rules: Dict[str, Any]
) -> Dict[str, Any]:
    """
    محرك استنتاج نقي (Stateless Inference Engine).
    يأخذ الواقع الميداني وسياسة المشروع، ويولد توصية النظام الآلية.
    """
    
    # 1. استخراج القواعد من السياسة (JSON)
    payment_rules = policy_rules.get("payment_rules", {})
    quality_rules = policy_rules.get("quality_rules", {})
    remark_rules = policy_rules.get("remark_rules", {})
    
    # القيم الافتراضية للتوصية
    recommendation = {
        "code": "HOLD",
        "note": "Awaiting further inspection or data.",
        "payment_pct": 0.0
    }

    # ==========================================
    # 🧠 Logic 1: فحص الجودة (Quality Check)
    # ==========================================
    if quality_status == "fail":
        recommendation["code"] = "REWORK"
        recommendation["note"] = "Quality failed. Rework required."
        recommendation["payment_pct"] = quality_rules.get("FAIL_PAYMENT_PCT", 0.0)
        return recommendation # توقف هنا، الفشل يطغى على كل شيء

    if quality_status == "pending":
        recommendation["code"] = "HOLD"
        recommendation["note"] = "Pending quality inspection."
        recommendation["payment_pct"] = quality_rules.get("PENDING_PAYMENT_PCT", 0.0)
        return recommendation

    # ==========================================
    # 🧠 Logic 2: فحص الملاحظات (Remarks Check)
    # ==========================================
    if quality_status == "pass":
        if highest_remark_severity == "critical":
            recommendation["code"] = "STOP"
            recommendation["note"] = "Critical safety/quality issue detected. Stop work."
            recommendation["payment_pct"] = remark_rules.get("CRITICAL_PAYMENT_PCT", 0.0)
            return recommendation
            
        elif highest_remark_severity == "major":
            recommendation["code"] = "HOLD"
            recommendation["note"] = "Major remark open. Payment withheld until resolved."
            recommendation["payment_pct"] = remark_rules.get("MAJOR_PAYMENT_PCT", 0.0)
            return recommendation
            
        elif highest_remark_severity == "minor":
            recommendation["code"] = "APPROVE_WITH_NOTE"
            recommendation["note"] = "Passed with minor remarks. Proceed with caution."
            # الدفع يعتمد على نسبة التنفيذ مضروبة في نسبة السماحية للملاحظات البسيطة
            allowance = remark_rules.get("MINOR_PAYMENT_PCT", 100.0) / 100.0
            recommendation["payment_pct"] = execution_pct * allowance
            return recommendation
            
        else:
            # لا توجد ملاحظات والجودة مقبولة
            recommendation["code"] = "APPROVE"
            recommendation["note"] = "Passed inspection with no remarks."
            recommendation["payment_pct"] = execution_pct
            return recommendation

    return recommendation


# ==========================================
# 📦 Default Policy Profiles (سياسات جاهزة للحقن)
# ==========================================

DEFAULT_POLICIES = [
    {
        "name": "NRC Strict",
        "description": "سياسة صارمة: لا دفع بدون فحص، الملاحظات الكبيرة توقف الدفع.",
        "is_default": True,
        "require_justification_on_override": True,
        "rules_json": {
            "quality_rules": {
                "FAIL_PAYMENT_PCT": 0.0,
                "PENDING_PAYMENT_PCT": 0.0
            },
            "remark_rules": {
                "CRITICAL_PAYMENT_PCT": 0.0,
                "MAJOR_PAYMENT_PCT": 0.0,
                "MINOR_PAYMENT_PCT": 100.0 # يُسمح بالدفع الكامل إذا كانت الملاحظة طفيفة
            },
            "payment_rules": {
                "PARTIAL_ALLOWED": True
            }
        }
    },
    {
        "name": "Emergency Fast-Track",
        "description": "سياسة طوارئ: يُسمح بدفع 80% للبنود قيد الفحص لتسريع العمل.",
        "is_default": False,
        "require_justification_on_override": True,
        "rules_json": {
            "quality_rules": {
                "FAIL_PAYMENT_PCT": 0.0,
                "PENDING_PAYMENT_PCT": 80.0 # 🌟 السماح بدفع 80% قبل الفحص
            },
            "remark_rules": {
                "CRITICAL_PAYMENT_PCT": 0.0,
                "MAJOR_PAYMENT_PCT": 50.0, # 🌟 السماح بدفع 50% رغم وجود ملاحظة كبيرة
                "MINOR_PAYMENT_PCT": 100.0
            },
            "payment_rules": {
                "PARTIAL_ALLOWED": True
            }
        }
    }
]