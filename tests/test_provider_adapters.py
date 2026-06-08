from anacronia.provider_adapters import (
    EUROPEANA_FUTURE_CAPABILITIES,
    MET_CAPABILITIES,
    VAM_CAPABILITIES,
)


def test_provider_capabilities_make_media_identity_and_eligibility_explicit():
    assert MET_CAPABILITIES.source_image_id_policy == "source_image_url"
    assert MET_CAPABILITIES.rights_eligibility_policy == "require_isPublicDomain_true"

    assert VAM_CAPABILITIES.source_image_id_policy == "record.images assetRef"
    assert VAM_CAPABILITIES.per_image_rights_metadata is True


def test_future_europeana_accepts_yes_and_yes_with_conditions_but_rejects_maybe():
    assert EUROPEANA_FUTURE_CAPABILITIES.accepted_reusability_values == (
        "open",
        "restricted",
    )
    assert EUROPEANA_FUTURE_CAPABILITIES.rejected_reusability_values == (
        "permission",
    )
